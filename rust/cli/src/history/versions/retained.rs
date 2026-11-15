use super::walk::walk_versions;
use crate::{
    client::text,
    sync::remote::{content::history_content, context::ISyncContext},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub struct IVersion {
    pub entry: p::IFileEntry,
    pub header: Option<p::ISigned<p::IManifestHeader>>,
    pub content: Option<Vec<u8>>,
}

pub fn retained(context: &ISyncContext<'_>, id: [u8; 32]) -> Result<(Vec<IVersion>, bool)> {
    let mut walks = walk_versions(&context.headers, &[id], |hash| {
        match context
            .client
            .request(&format!("/v1/files/{}", text(hash)), "GET", None)
        {
            Ok(response) => decode_list(&response.body, hash).map(Some),
            Err(e) if e.code == ErrorCode::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    })?;
    let walk = walks.remove(&p::base32(&id)).unwrap_or_default();
    let mut pruned = walk.pruned;
    let mut versions = Vec::new();
    for version in walk.versions {
        if crate::sync::remote::content::entry_name(context, &version.entry).is_err() {
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
    Ok((versions, pruned))
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
