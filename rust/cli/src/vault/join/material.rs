use super::decode_verified_state;
use crate::{adapters::IAdapters, client::binary};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use serde_json::Value;
use std::collections::BTreeMap;

pub struct ICheckpointMaterial {
    pub headers: Vec<p::ISigned<p::IManifestHeader>>,
    pub entries: Vec<p::ISigned<p::TEntry>>,
    pub keys: BTreeMap<u32, [u8; 32]>,
    pub checkpoint: c::ICheckpoint,
}

pub fn checkpoint_material(adapters: &IAdapters, state: &Value) -> Result<ICheckpointMaterial> {
    let string = |key: &str| {
        state[key]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| invalid("Missing checkpoint material"))
    };
    let checkpoint = binary(string("checkpoint")?)?;
    let files = binary(string("files")?)?;
    let keyring = binary(string("keyring")?)?;
    let vault_id = p::fixed(&p::unbase32(string("vaultId")?)?)?;
    let headers: Vec<p::ISigned<p::IManifestHeader>> = state["headers"]
        .as_array()
        .ok_or_else(|| invalid("Missing checkpoint material"))?
        .iter()
        .map(|v| {
            p::decode(&binary(
                v.as_str()
                    .ok_or_else(|| invalid("Missing checkpoint material"))?,
            )?)
        })
        .collect::<Result<_>>()?;
    let entries: Vec<p::ISigned<p::TEntry>> = state["entries"]
        .as_array()
        .ok_or_else(|| invalid("Missing checkpoint material"))?
        .iter()
        .map(|v| {
            p::decode(&binary(
                v.as_str()
                    .ok_or_else(|| invalid("Missing checkpoint material"))?,
            )?)
        })
        .collect::<Result<_>>()?;
    let header = headers
        .iter()
        .find(|h| p::object_hash(*h, "manifest").is_ok_and(|h| h.as_slice() == checkpoint))
        .cloned()
        .ok_or_else(|| invalid("Missing checkpoint header"))?;
    let verified = state
        .get("verifiedState")
        .map(decode_verified_state)
        .transpose()?;
    let chain = if let Some(verified) = verified.filter(|v| v.seq == header.body.list_seq) {
        Some(verified)
    } else {
        let prefix: Vec<_> = entries
            .iter()
            .filter(|e| e.body.seq <= header.body.list_seq)
            .cloned()
            .collect();
        match c::verify_chain(&prefix)? {
            c::TDeviceListResult::Valid { state } => Some(*state),
            c::TDeviceListResult::Invalid => None,
        }
    };
    let id_key = adapters
        .keychain
        .get(&format!("envden/{}/id-key", adapters.home.display()), false)?;
    let key = adapters.keychain.get(
        &format!(
            "envden/{}/epoch/{}",
            adapters.home.display(),
            header.body.epoch
        ),
        false,
    )?;
    let (Some(chain), Some(id_key), Some(key)) = (chain, id_key, key) else {
        return Err(EnvdenError::new(
            ErrorCode::Locked,
            "Vault keys unavailable",
        ));
    };
    let id_key = p::fixed(&id_key)?;
    let key = p::fixed(&key)?;
    let ring = p::open_keyring(
        &keyring,
        &key,
        &vault_id,
        header.body.epoch,
        &chain.commits,
        Some(&id_key),
    )?;
    let mut keys: BTreeMap<_, _> = ring
        .older
        .into_iter()
        .map(|older| (older.epoch, older.key))
        .collect();
    keys.insert(header.body.epoch, key);
    Ok(ICheckpointMaterial {
        headers,
        entries,
        keys,
        checkpoint: c::ICheckpoint {
            header,
            files: p::decode(&files)?,
            state: chain,
            id_key,
        },
    })
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}
