use super::context::ISyncContext;
use crate::{client::text, state::files::atomic_write, sync::local::files::read_bytes};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub fn entry_name(context: &ISyncContext<'_>, entry: &p::IFileEntry) -> Result<p::IFileName> {
    let key = context
        .keys
        .get(&entry.epoch)
        .ok_or_else(|| EnvdenError::new(ErrorCode::Locked, "Epoch key unavailable"))?;
    p::open_file_name(
        &entry.name,
        key,
        &context.checkpoint.id_key,
        &p::IFileContext {
            vault_id: context.vault_id,
            epoch: entry.epoch,
            file_id: entry.file_id,
            version: entry.version,
        },
    )
}

pub fn readable_entries(context: &ISyncContext<'_>) -> Result<Vec<p::IFileEntry>> {
    let mut readable = Vec::new();
    for entry in &context.checkpoint.files.entries {
        match entry_name(context, entry) {
            Ok(_) => readable.push(entry.clone()),
            Err(e) if e.code == ErrorCode::Locked => return Err(e),
            Err(_) => {}
        }
    }
    Ok(readable)
}

pub fn entry_content(context: &ISyncContext<'_>, entry: &p::IFileEntry) -> Result<Option<Vec<u8>>> {
    if matches!(entry.state, 2 | 4) {
        return Ok(None);
    }
    let name = entry_name(context, entry)?;
    let path = context
        .adapters
        .home
        .join("state/blobs")
        .join(text(&entry.blob_hash));
    let cached = read_bytes(&path)?;
    let bytes = match &cached {
        Some(bytes) => bytes.clone(),
        None => {
            context
                .client
                .request(
                    &format!("/v1/blobs/{}", text(&entry.blob_hash)),
                    "GET",
                    None,
                )?
                .body
        }
    };
    let key = context
        .keys
        .get(&entry.epoch)
        .ok_or_else(|| EnvdenError::new(ErrorCode::Locked, "Epoch key unavailable"))?;
    let file = p::open_file(
        &bytes,
        key,
        &context.checkpoint.id_key,
        &p::IFileContext {
            vault_id: context.vault_id,
            epoch: entry.epoch,
            file_id: entry.file_id,
            version: entry.version,
        },
        &entry.blob_hash,
        &name,
    )?;
    if cached.is_none() {
        atomic_write(&path, &bytes, (context.options.now)())?;
    }
    Ok(Some(file.content))
}
