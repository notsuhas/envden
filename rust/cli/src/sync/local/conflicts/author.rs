use crate::{
    client::text,
    sync::{local::files::read_bytes, remote::context::ISyncContext},
};
use envden_protocol::protocol as p;

pub fn entry_author(context: &ISyncContext<'_>, entry: &p::IFileEntry) -> Option<String> {
    let mut signer = None;
    for header in context.headers.iter().rev() {
        let files = if header.body.files_hash == context.checkpoint.header.body.files_hash {
            context.checkpoint.files.clone()
        } else {
            let bytes = read_bytes(
                &context
                    .adapters
                    .home
                    .join("state/file-lists")
                    .join(text(&header.body.files_hash)),
            )
            .ok()??;
            p::decode::<p::IFiles>(&bytes).ok()?
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
    let signer = signer?;
    if signer == context.identity.record.id {
        return None;
    }
    context
        .checkpoint
        .state
        .devices
        .get(&signer)
        .map(|d| d.name.clone())
}
