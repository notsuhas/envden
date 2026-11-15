use crate::{http::types::IAppOptions, middleware::IAuth, vault::vault_chain};
use envden_core::{
    adapters::storage::{IStateWrite, IStoredSwap, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;

pub(crate) fn prepare_move(
    options: &IAppOptions,
    auth: &IAuth,
    swap: &ISwap,
    stored: &mut IStoredSwap,
    destination: &[u8; 32],
) -> Result<()> {
    if swap.header.body.op != 10 {
        return Ok(());
    }
    let storage = options.storage.as_ref();
    let id = &auth.request.vault_id;
    let mut vault = storage.vault(id)?.expect("authorized vault");
    if !vault.active {
        let header = vault_chain(storage, id)?.0.body;
        for (kind, hash, key, label) in [
            (
                TStateKind::Keyring,
                header.keyring_hash,
                header.keyring_hash.to_vec(),
                "keyring-blob",
            ),
            (
                TStateKind::Envelope,
                header.envelope_hash,
                vec![],
                "envelope-blob",
            ),
        ] {
            let bytes = storage.state(id, kind, &key)?.ok_or_else(|| {
                EnvdenError::new(ErrorCode::InvalidData, "Incomplete move material")
            })?;
            if h(label, &bytes) != hash {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Incomplete move material",
                ));
            }
        }
        let bytes = storage
            .file_list(id, &header.files_hash)?
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing head file list"))?;
        if h("files", &bytes) != header.files_hash
            || storage
                .state(id, TStateKind::SkPub, &[])?
                .is_none_or(|v| v.len() != 32)
        {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Incomplete move material",
            ));
        }
        let files: IFiles = decode(&bytes)?;
        for file in files.entries {
            if matches!(file.state, 1 | 3) && !storage.has_blob(id, &file.blob_hash)? {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Missing imported blob",
                ));
            }
        }
        for hash in storage.blob_hashes(id)? {
            if storage
                .get_blob(id, &hash)?
                .is_none_or(|bytes| h("blob", &bytes).as_slice() != hash)
            {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Invalid imported blob",
                ));
            }
        }
        let record = storage
            .state(id, TStateKind::MoveSession, b"registration")?
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::Unauthorized, "Move registration required")
            })?;
        stored.state.get_or_insert_default().extend([
            IStateWrite {
                kind: TStateKind::OpaqueRecord,
                key: vec![],
                bytes: Some(record),
            },
            IStateWrite {
                kind: TStateKind::MoveSession,
                key: vec![],
                bytes: None,
            },
            IStateWrite {
                kind: TStateKind::MoveSession,
                key: b"registration".to_vec(),
                bytes: None,
            },
        ]);
        vault.active = true;
        vault.frozen = false;
    } else {
        vault.frozen = true;
        vault.server_moved = Some(destination.to_vec());
    }
    stored.vault = Some(vault);

    Ok(())
}
