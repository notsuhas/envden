use crate::{http::types::IAppOptions, middleware::IAuth, vault::membership};
use envden_core::{
    adapters::storage::{IStateWrite, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;

pub(crate) fn store_material(
    options: &IAppOptions,
    auth: &IAuth,
    kind: &str,
    hash: &[u8],
    bytes: &[u8],
) -> Result<()> {
    let storage = options.storage.as_ref();
    let id = &auth.request.vault_id;
    storage.transaction(&mut || {
        if storage.vault(id)?.is_some_and(|v| v.restored.is_some()) {
            if membership(&options.storage, id, &auth.request.device)?.is_none() {
                return Err(EnvdenError::new(
                    ErrorCode::NotMember,
                    "Membership required",
                ));
            }
            if kind == "skPub" {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Invalid repair material",
                ));
            }
        }
        if kind == "files" {
            return super::files::restore_files(options, id, hash, bytes);
        }
        let headers = storage
            .headers(id, 1, u64::MAX, None, None)?
            .iter()
            .map(|stored| decode::<ISigned<IManifestHeader>>(&stored.bytes).map(|h| h.body))
            .collect::<Result<Vec<_>>>()?;
        if bytes.len() > 16777216 || !matches!(kind, "keyring" | "envelope" | "skPub") {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Invalid material",
            ));
        }
        if if kind == "skPub" {
            bytes.len() != 32
        } else {
            h(
                if kind == "keyring" {
                    "keyring-blob"
                } else {
                    "envelope-blob"
                },
                bytes,
            )
            .as_slice()
                != hash
        } {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Material hash mismatch",
            ));
        }
        if kind != "skPub"
            && !(if kind == "keyring" {
                headers.iter().any(|h| h.keyring_hash.as_slice() == hash)
            } else {
                headers
                    .last()
                    .is_some_and(|h| h.envelope_hash.as_slice() == hash)
            })
        {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Unreferenced material",
            ));
        }
        storage.write_state(
            id,
            &[IStateWrite {
                kind: match kind {
                    "keyring" => TStateKind::Keyring,
                    "envelope" => TStateKind::Envelope,
                    _ => TStateKind::SkPub,
                },
                key: if kind == "keyring" {
                    hash.to_vec()
                } else {
                    vec![]
                },
                bytes: Some(bytes.to_vec()),
            }],
        )
    })
}
