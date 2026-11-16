use crate::{
    client::text,
    sync::{local::files::read_bytes, remote::context::ISyncContext},
};
use envden_protocol::protocol as p;

pub fn entry_author(
    context: &ISyncContext<'_>,
    entry: &p::IFileEntry,
) -> envden_core::errors::Result<Option<String>> {
    let mut signer = None;
    for header in context.headers.iter().rev() {
        let files = if header.body.files_hash == context.checkpoint.header.body.files_hash {
            context.checkpoint.files.clone()
        } else {
            let Some(bytes) = read_bytes(
                &context
                    .adapters
                    .home
                    .join("state/file-lists")
                    .join(text(&header.body.files_hash)),
            )?
            else {
                return Ok(None);
            };
            let Ok(files) = p::decode::<p::IFiles>(&bytes) else {
                return Ok(None);
            };
            files
        };
        if !files
            .entries
            .iter()
            .any(|e| e.file_id == entry.file_id && e.version == entry.version)
        {
            break;
        }
        signer = Some(header.body.signer);
    }
    let Some(signer) = signer else {
        return Ok(None);
    };
    if signer == context.identity.record.id {
        return Ok(None);
    }
    Ok(context
        .checkpoint
        .state
        .devices
        .get(&signer)
        .map(|device| device.name.clone()))
}
