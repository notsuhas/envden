use super::operation::deletion::{read_deletion, request_deletion, suffix};
use crate::{
    client::binary,
    state::records::recover_sync_record,
    sync::{
        local::{
            applied::applied_files,
            conflicts::IConflictTarget,
            files::{base_path, read_bytes, write_bytes},
        },
        remote::{content::entry_content, context::ISyncContext},
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::path::Path;

pub struct IAncestry {
    pub server: Option<Vec<u8>>,
    pub encoded: Option<String>,
    pub previous: Option<Vec<u8>>,
    pub reappeared: bool,
    pub deleting: bool,
    pub invalid: bool,
    pub corrupt: bool,
    pub stored: Option<Vec<u8>>,
    pub before: Option<Vec<u8>>,
    pub restored: bool,
}

pub fn ancestry(
    context: &ISyncContext<'_>,
    store: &str,
    targets: &[IConflictTarget],
    entry: Option<&p::IFileEntry>,
) -> Result<IAncestry> {
    let home = &context.adapters.home;
    let now = (context.options.now)();
    let base = base_path(home, store, None);
    let ancestor = recover_sync_record(
        &suffix(&base, ".entry"),
        &suffix(&base, ".corrupt"),
        |saved| {
            let _: p::IFileEntry = p::decode(&binary(saved)?)?;
            Ok(saved.to_owned())
        },
        now,
        |m| {
            if let Some(report) = &context.options.report {
                report(m);
            }
        },
    )?;
    read_deletion(home, store, now)?;
    let corrupt = read_bytes(&suffix(&base, ".corrupt"))?.is_some();
    let applied = applied_files(home)?;
    let encoded = if corrupt {
        None
    } else {
        ancestor.or_else(|| {
            entry.and_then(|e| {
                applied
                    .get(&p::base32(&e.file_id))?
                    .as_str()
                    .map(str::to_owned)
            })
        })
    };
    let previous = encoded
        .as_deref()
        .map(|e| entry_content(context, &p::decode::<p::IFileEntry>(&binary(e)?)?))
        .transpose()?
        .flatten();
    let server = entry
        .map(|entry| entry_content(context, entry))
        .transpose()?
        .flatten();
    let mut reappeared = None;
    if !corrupt && let Some(intent) = read_deletion(home, store, now)? {
        let paths = std::iter::once(store.to_owned()).chain(
            targets
                .iter()
                .map(|t| {
                    Path::new(&t.root)
                        .join(&t.path)
                        .to_string_lossy()
                        .into_owned()
                })
                .filter(|p| intent.targets.contains(p)),
        );
        for path in paths {
            if let Some(bytes) = read_bytes(Path::new(&path))? {
                request_deletion(home, store, false, None, None, now)?;
                if let Some(report) = &context.options.report {
                    report(&format!("Cancelled removal; restored env file: {path}"));
                }
                reappeared = Some(bytes);
                break;
            }
        }
    }
    if entry.is_some_and(|e| matches!(e.state, 2 | 4)) {
        request_deletion(home, store, false, None, None, now)?;
    }
    let intent = read_deletion(home, store, now)?;
    let deleting = intent.is_some();
    let invalid = intent.as_ref().zip(entry).is_some_and(|(intent, e)| {
        p::encode(e).is_ok_and(|b| intent.entry != crate::client::text(&b))
    });
    let before = read_bytes(Path::new(store))?.or(reappeared.clone());
    let restored = before.is_none() && server.is_some() && !deleting && !corrupt;
    if restored {
        write_bytes(Path::new(store), server.as_deref(), now)?;
    }
    let stored = if restored {
        server.clone()
    } else {
        before.clone()
    };
    Ok(IAncestry {
        server,
        encoded,
        previous,
        reappeared: reappeared.is_some(),
        deleting,
        invalid,
        corrupt,
        stored,
        before,
        restored,
    })
}
