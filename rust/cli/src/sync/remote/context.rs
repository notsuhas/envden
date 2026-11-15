use crate::{
    adapters::IAdapters,
    client::{IClient, ITransport},
    identity::IDeviceIdentity,
    state::{NOT_SET_UP, repository::load_state},
    time::TClock,
    vault::{join::checkpoint_material, vault_connection},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain::ICheckpoint, protocol as p};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    path::PathBuf,
    rc::Rc,
};

pub type TChoose = Rc<dyn Fn(&str) -> Result<String>>;
pub type TConfirm = Rc<dyn Fn(&[String]) -> Result<bool>>;
pub type TReport = Rc<dyn Fn(&str)>;

pub struct ISyncOptions {
    pub now: TClock,
    pub cwd: Option<PathBuf>,
    pub all: bool,
    pub yes: bool,
    pub interactive: bool,
    pub choose: Option<TChoose>,
    pub confirm: Option<TConfirm>,
    pub report: Option<TReport>,
}

pub struct ISyncContext<'a> {
    pub adapters: &'a IAdapters,
    pub options: ISyncOptions,
    pub state: Value,
    pub skipped_roots: HashSet<String>,
    pub identity: IDeviceIdentity,
    pub vault_id: [u8; 32],
    pub client: IClient,
    pub headers: Vec<p::ISigned<p::IManifestHeader>>,
    pub entries: Vec<p::ISigned<p::TEntry>>,
    pub keys: BTreeMap<u32, [u8; 32]>,
    pub checkpoint: ICheckpoint,
}

pub fn sync_context(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
) -> Result<ISyncContext<'_>> {
    let state = load_state(&adapters.home)?
        .filter(|s| {
            ["server", "vaultId", "checkpoint", "files", "keyring"]
                .iter()
                .all(|key| s.get(key).is_some_and(|v| !v.is_null()))
        })
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, NOT_SET_UP))?;
    let mut connection = vault_connection(adapters, &state, transport)?;
    if options.interactive {
        connection = connection.with_unlock(Rc::new(|client, vault| {
            crate::session::login(
                client,
                vault,
                crate::session::TPassword::Prompt(&mut |retry| {
                    crate::output::prompts::secret(
                        if retry {
                            "Wrong master password. Try again"
                        } else {
                            "Master password"
                        },
                        |_| None,
                    )
                }),
                p::TLoginPurpose::Unlock,
            )
            .map(|_| ())
        }));
    }
    let material = checkpoint_material(adapters, &state)?;
    Ok(ISyncContext {
        adapters,
        options,
        state,
        skipped_roots: HashSet::new(),
        identity: connection.identity,
        vault_id: connection.vault_id,
        client: connection.client,
        headers: material.headers,
        entries: material.entries,
        keys: material.keys,
        checkpoint: material.checkpoint,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    struct NeverCall;
    impl ITransport for NeverCall {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            panic!("missing state must not use network")
        }
    }
    #[test]
    fn unconfigured_context_refuses_before_keys_or_network() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(dir.path().to_owned()),
            dir.path().to_owned(),
            || 1,
        );
        let options = ISyncOptions {
            now: adapters.now,
            cwd: None,
            all: true,
            yes: true,
            interactive: false,
            choose: None,
            confirm: None,
            report: None,
        };
        assert_eq!(
            sync_context(&adapters, options, Rc::new(NeverCall))
                .err()
                .unwrap()
                .message,
            NOT_SET_UP
        );
    }
}
