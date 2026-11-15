use super::context::ISyncContext;
use crate::{
    client::{IClient, text},
    vault::history::IVaultHistory,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::{cell::RefCell, collections::BTreeMap};

pub(super) struct IRemoteSource<'a> {
    pub history: &'a IVaultHistory,
    pub head: &'a p::ISigned<p::IManifestHeader>,
    pub context: &'a ISyncContext<'a>,
    pub files: RefCell<BTreeMap<String, p::IFiles>>,
    pub keyring: RefCell<Option<Vec<u8>>>,
    pub keys: RefCell<BTreeMap<u32, [u8; 32]>>,
}

impl c::IChainSource for IRemoteSource<'_> {
    fn header(&self, hash: &[u8; 32]) -> Result<Option<p::ISigned<p::IManifestHeader>>> {
        Ok(self
            .history
            .headers
            .iter()
            .find(|h| p::object_hash(*h, "manifest").is_ok_and(|h| h == *hash))
            .cloned())
    }
    fn entry(&self, hash: &[u8; 32]) -> Result<Option<p::ISigned<p::TEntry>>> {
        Ok(self
            .history
            .entries
            .iter()
            .find(|e| p::object_hash(*e, "entry").is_ok_and(|h| h == *hash))
            .cloned())
    }
    fn files(&self, hash: &[u8; 32]) -> Result<Option<p::IFiles>> {
        let bytes = match verified_blob(&self.context.client, "files", hash) {
            Ok(bytes) => bytes,
            Err(e) if e.code == ErrorCode::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        let files: p::IFiles = p::decode(&bytes)?;
        self.files.borrow_mut().insert(text(hash), files.clone());
        Ok(Some(files))
    }
    fn keyring(&self, hash: &[u8; 32]) -> Result<Option<Vec<u8>>> {
        let bytes = self
            .context
            .client
            .request(&format!("/v1/keyrings/{}", text(hash)), "GET", None)?
            .body;
        *self.keyring.borrow_mut() = Some(bytes.clone());
        Ok(Some(bytes))
    }
    fn epoch_key(&self, epoch: u32) -> Result<Option<[u8; 32]>> {
        let entries: Vec<_> = self
            .history
            .entries
            .iter()
            .filter(|e| e.body.seq <= self.head.body.list_seq)
            .cloned()
            .collect();
        let c::TDeviceListResult::Valid { state } = c::verify_chain(&entries)? else {
            return Ok(None);
        };
        let recipient = &self.context.identity.record.id;
        let mut wrap = None;
        for entry in &entries {
            match &entry.body.change {
                p::TEntryPayload::AddDevice(add) if &add.device.id == recipient => {
                    wrap = Some(add.wrap.clone())
                }
                p::TEntryPayload::NewEpoch(epoch) => {
                    wrap = epoch
                        .change
                        .wraps
                        .iter()
                        .find(|w| &w.recipient == recipient)
                        .cloned()
                }
                p::TEntryPayload::RemoveDevice(remove) => {
                    wrap = remove
                        .change
                        .wraps
                        .iter()
                        .find(|w| &w.recipient == recipient)
                        .cloned()
                }
                p::TEntryPayload::ReplaceRecovery(recovery) => {
                    wrap = recovery
                        .change
                        .wraps
                        .iter()
                        .find(|w| &w.recipient == recipient)
                        .cloned()
                }
                _ => {}
            }
        }
        let (Some(wrap), Some(commit)) = (wrap, state.commits.get(&epoch)) else {
            return Ok(None);
        };
        let key = p::open_wrap(
            &wrap,
            &self.context.identity.keys.enc_sk,
            &self.context.identity.record.enc_pub,
            &self.context.vault_id,
            epoch,
            commit,
        )?;
        self.keys.borrow_mut().insert(epoch, key);
        Ok(Some(key))
    }
}

fn verified_blob(client: &IClient, kind: &str, hash: &[u8; 32]) -> Result<Vec<u8>> {
    let bytes = client
        .request(&format!("/v1/{kind}/{}", text(hash)), "GET", None)?
        .body;
    if p::h(kind, &bytes) != *hash {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Invalid join blob hash",
        ));
    }
    Ok(bytes)
}
