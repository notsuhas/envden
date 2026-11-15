use super::walk::walk_versions;
use crate::{
    client::text,
    sync::remote::{content::entry_content, context::ISyncContext},
};
use envden_core::errors::{ErrorCode, Result};
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
            Ok(response) => p::decode(&response.body).map(Some),
            Err(e) if e.code == ErrorCode::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    })?;
    let walk = walks.remove(&p::base32(&id)).unwrap_or_default();
    let mut pruned = walk.pruned;
    let mut versions = Vec::new();
    for version in walk.versions {
        match entry_content(context, &version.entry) {
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
