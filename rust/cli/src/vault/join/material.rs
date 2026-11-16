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
    for key in ["checkpoint", "files", "keyring", "vaultId"] {
        string(key)?;
    }
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
    let mut header = None;
    for candidate in &headers {
        if p::object_hash(candidate, "manifest")?.as_slice() == binary(string("checkpoint")?)? {
            header = Some(candidate.clone());
            break;
        }
    }
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
    let header = header.ok_or_else(|| invalid("Missing checkpoint header"))?;
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
        &binary(string("keyring")?)?,
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
            files: p::decode(&binary(string("files")?)?)?,
            state: chain,
            id_key,
        },
    })
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cached_headers_are_decoded_before_checkpoint_bytes() {
        let root = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(root.path().into()), root.path().into(), || 42);
        let state = serde_json::json!({"checkpoint":"!","files":"AQ","keyring":"AQ","vaultId":p::base32(&[1;32]),"headers":[""],"entries":[]});
        assert_eq!(
            checkpoint_material(&adapters, &state)
                .err()
                .unwrap()
                .message,
            "Truncated data"
        );
    }
}
