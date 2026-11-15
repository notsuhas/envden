use super::codec::IAttempt;
use crate::{
    client::binary,
    state::files::atomic_write,
    store::store_path,
    sync::{
        local::{
            applied::{applied_files, save_applied_files},
            files::{base_path, write_bytes},
            reconciliation::operation::deletion::{read_deletion, request_deletion, suffix},
        },
        remote::{
            content::{entry_content, entry_name},
            context::ISyncContext,
        },
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::path::Path;

pub(super) fn apply(context: &ISyncContext<'_>, attempt: &IAttempt) -> Result<()> {
    let mut applied = applied_files(&context.adapters.home)?;
    let now = (context.options.now)();
    for encoded in &attempt.entries {
        let entry: p::IFileEntry = p::decode(&binary(encoded)?)?;
        let name = entry_name(context, &entry)?;
        let store = store_path(&context.adapters.home, &name.repo_id, &name.path)?
            .to_string_lossy()
            .into_owned();
        let content = entry_content(context, &entry)?;
        let base = base_path(&context.adapters.home, &store, None);
        for place in &attempt.places {
            if Path::new(place) == base
                || context.state["links"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|l| {
                        l["store"] == store
                            && l["mode"] == "copy"
                            && Path::new(place)
                                == base_path(&context.adapters.home, &store, l["root"].as_str())
                    })
            {
                write_bytes(Path::new(place), content.as_deref(), now)?;
            }
        }
        atomic_write(&suffix(&base, ".entry"), encoded.as_bytes(), now)?;
        applied.insert(p::base32(&entry.file_id), encoded.clone().into());
        if read_deletion(&context.adapters.home, &store, now)?.is_some() {
            request_deletion(
                &context.adapters.home,
                &store,
                content.is_some(),
                Some(encoded),
                None,
                now,
            )?;
        }
    }
    save_applied_files(&context.adapters.home, applied, now)
}
