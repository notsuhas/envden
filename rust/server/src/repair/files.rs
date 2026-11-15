use crate::http::{encoding::input, types::IAppOptions};
use envden_core::{
    adapters::storage::{IFileVersion, IStoredFiles},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;

pub(super) fn restore_files(
    options: &IAppOptions,
    id: &[u8],
    hash: &[u8],
    bytes: &[u8],
) -> Result<()> {
    let files: IFiles = input(|| decode(bytes))?;
    if h("files", bytes).as_slice() != hash {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Files hash mismatch",
        ));
    }
    let headers = match options.storage.headers_for_files(id, hash) {
        Err(error) if error.code == ErrorCode::NotImplemented => {
            options.storage.headers(id, 1, u64::MAX, None, None)?
        }
        result => result?,
    }
    .iter()
    .map(|stored| decode::<ISigned<IManifestHeader>>(&stored.bytes).map(|header| header.body))
    .collect::<Result<Vec<_>>>()?;
    if !headers
        .iter()
        .any(|header| header.files_hash.as_slice() == hash)
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Unreferenced files",
        ));
    }
    let retain_forever = headers.iter().enumerate().any(|(index, header)| {
        header.op == 11
            && (header.files_hash.as_slice() == hash
                || index > 0 && headers[index - 1].files_hash.as_slice() == hash)
    });
    options
        .storage
        .put_file_list(
            id,
            &IStoredFiles {
                hash: hash.to_vec(),
                bytes: bytes.to_vec(),
                retain_forever: Some(retain_forever),
                versions: files
                    .entries
                    .iter()
                    .map(|entry| IFileVersion {
                        file_id: entry.file_id.to_vec(),
                        version: entry.version,
                        blob_hash: matches!(entry.state, 1 | 3).then(|| entry.blob_hash.to_vec()),
                        tombstone: matches!(entry.state, 2 | 4),
                    })
                    .collect(),
            },
            (options.now)(),
        )
        .map_err(|error| {
            if error.code == ErrorCode::NotImplemented {
                EnvdenError::with_source(
                    ErrorCode::NotImplemented,
                    "File restoration unavailable",
                    error,
                )
            } else {
                error
            }
        })
}

#[cfg(test)]
#[path = "tests/files.rs"]
mod tests;
