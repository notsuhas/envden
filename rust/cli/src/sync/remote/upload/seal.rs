use super::super::context::ISyncContext;
use crate::{client::text, state::files::atomic_write};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub(super) fn seal(
    context: &ISyncContext<'_>,
    repo: &str,
    path: &str,
    id: [u8; 32],
    version: u64,
    bytes: Option<&[u8]>,
) -> Result<p::IFileEntry> {
    let epoch = context.checkpoint.header.body.epoch;
    let key = &context.keys[&epoch];
    let c = p::IFileContext {
        vault_id: context.vault_id,
        epoch,
        file_id: id,
        version,
    };
    let name = p::IFileName {
        repo_id: repo.into(),
        path: path.into(),
    };
    let mut hash = [0; 32];
    if let Some(bytes) = bytes {
        let blob = p::seal_file(
            &p::IFile {
                repo_id: repo.into(),
                path: path.into(),
                content: bytes.to_vec(),
            },
            key,
            &c,
            &p::random_bytes::<24>(),
        )?;
        hash = p::h("blob", &blob);
        context
            .client
            .request_bytes(&format!("/v1/blobs/{}", text(&hash)), "PUT", &blob)?;
        atomic_write(
            &context.adapters.home.join("state/blobs").join(text(&hash)),
            &blob,
            (context.options.now)(),
        )?;
    }
    Ok(p::IFileEntry {
        file_id: id,
        epoch,
        version,
        state: if bytes.is_some() { 1 } else { 2 },
        blob_hash: hash,
        name: p::seal_file_name(&name, key, &c, &p::random_bytes::<24>())?,
    })
}
