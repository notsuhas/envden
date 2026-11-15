use crate::{
    http::{encoding::input, types::IAppOptions},
    middleware::IAuth,
    vault::membership,
};
use envden_core::{
    adapters::storage::{IFileVersion, IStateWrite, IStoredFiles, TStateKind},
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
            if membership(storage, id, &auth.request.device)?.is_none() {
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
        let headers = storage
            .headers(id, 1, u64::MAX, None, None)?
            .iter()
            .map(|stored| decode::<ISigned<IManifestHeader>>(&stored.bytes).map(|h| h.body))
            .collect::<Result<Vec<_>>>()?;
        if kind == "files" {
            let files: IFiles = input(|| decode(bytes))?;
            if h("files", bytes).as_slice() != hash {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Files hash mismatch",
                ));
            }
            if !headers.iter().any(|h| h.files_hash.as_slice() == hash) {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Unreferenced files",
                ));
            }
            let referenced = storage
                .headers_for_files(id, hash)?
                .iter()
                .map(|stored| decode::<ISigned<IManifestHeader>>(&stored.bytes).map(|h| h.body))
                .collect::<Result<Vec<_>>>()?;
            let retain_forever = referenced.iter().enumerate().any(|(index, header)| {
                header.op == 11
                    && (header.files_hash.as_slice() == hash
                        || index > 0 && referenced[index - 1].files_hash.as_slice() == hash)
            });
            return storage.put_file_list(
                id,
                &IStoredFiles {
                    hash: hash.to_vec(),
                    bytes: bytes.to_vec(),
                    retain_forever: Some(retain_forever),
                    versions: files
                        .entries
                        .iter()
                        .map(|e| IFileVersion {
                            file_id: e.file_id.to_vec(),
                            version: e.version,
                            blob_hash: if matches!(e.state, 1 | 3) {
                                Some(e.blob_hash.to_vec())
                            } else {
                                None
                            },
                            tombstone: matches!(e.state, 2 | 4),
                        })
                        .collect(),
                },
                (options.now)(),
            );
        }
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
