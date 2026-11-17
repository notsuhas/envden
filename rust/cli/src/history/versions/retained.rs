use super::walk::walk_versions;
use crate::{client::text, history::versions::source::IHistorySource};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::collections::BTreeMap;

pub type TRetained = BTreeMap<String, (Vec<IVersion>, bool)>;

pub struct IVersion {
    pub entry: p::IFileEntry,
    pub header: Option<p::ISigned<p::IManifestHeader>>,
    pub content: Option<Vec<u8>>,
}

pub fn retained(context: &IHistorySource<'_>, ids: &[[u8; 32]]) -> Result<TRetained> {
    let walks = walk_versions(&context.history.headers, ids, |hash| {
        match context
            .context
            .client
            .request(&format!("/v1/files/{}", text(hash)), "GET", None)
        {
            Ok(response) => decode_list(&response.body, hash).map(Some),
            Err(e) if e.code == ErrorCode::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    })?;
    let mut result = BTreeMap::new();
    for (id, walk) in walks {
        let mut pruned = walk.pruned;
        let mut versions = Vec::new();
        for version in walk.versions {
            if entry_name(context, &version.entry).is_err() {
                continue;
            }
            match history_content(context, &version.entry) {
                Ok(content) => versions.push(IVersion {
                    entry: version.entry,
                    header: version.header,
                    content,
                }),
                Err(e) if e.code == ErrorCode::NotFound => {
                    pruned = true;
                    break;
                }
                Err(e) => return Err(e),
            }
        }
        result.insert(id, (versions, pruned));
    }
    Ok(result)
}

fn decode_list(bytes: &[u8], hash: &[u8; 32]) -> Result<p::IFiles> {
    if p::h("files", bytes) != *hash {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "File list hash mismatch",
        ));
    }
    p::decode(bytes)
}

fn entry_name(source: &IHistorySource<'_>, entry: &p::IFileEntry) -> Result<p::IFileName> {
    let key = source.keys.get(&entry.epoch).ok_or_else(|| {
        EnvdenError::new(
            ErrorCode::InvalidData,
            "Vault key for an earlier epoch is missing",
        )
    })?;
    p::open_file_name(
        &entry.name,
        key,
        &source.id_key,
        &p::IFileContext {
            vault_id: source.context.vault_id,
            epoch: entry.epoch,
            file_id: entry.file_id,
            version: entry.version,
        },
    )
}

fn history_content(source: &IHistorySource<'_>, entry: &p::IFileEntry) -> Result<Option<Vec<u8>>> {
    if matches!(entry.state, 2 | 4) {
        return Ok(None);
    }
    let name = entry_name(source, entry)?;
    let path = source
        .context
        .adapters
        .home
        .join("state/blobs")
        .join(text(&entry.blob_hash));
    let bytes = match crate::sync::local::files::read_bytes(&path)? {
        Some(bytes) => bytes,
        None => {
            source
                .context
                .client
                .request(
                    &format!("/v1/blobs/{}", text(&entry.blob_hash)),
                    "GET",
                    None,
                )?
                .body
        }
    };
    let key = source.keys.get(&entry.epoch).ok_or_else(|| {
        EnvdenError::new(
            ErrorCode::InvalidData,
            "Vault key for an earlier epoch is missing",
        )
    })?;
    let file = p::open_file(
        &bytes,
        key,
        &source.id_key,
        &p::IFileContext {
            vault_id: source.context.vault_id,
            epoch: entry.epoch,
            file_id: entry.file_id,
            version: entry.version,
        },
        &entry.blob_hash,
        &name,
    )?;

    Ok(Some(file.content))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retained_lists_require_the_requested_hash() {
        let bytes = p::encode(&p::IFiles { entries: vec![] }).unwrap();
        assert!(
            decode_list(&bytes, &p::h("files", &bytes))
                .unwrap()
                .entries
                .is_empty()
        );
        assert_eq!(
            decode_list(&bytes, &[0; 32]).unwrap_err().message,
            "File list hash mismatch"
        );
    }
}
