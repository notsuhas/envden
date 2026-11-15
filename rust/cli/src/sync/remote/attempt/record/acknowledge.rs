use super::{application::apply, codec::decode};
use crate::{
    client::text,
    state::{files::atomic_write, records::recover_sync_record},
    sync::{
        local::{
            files::{base_path, write_bytes},
            reconciliation::operation::deletion::suffix,
        },
        remote::context::ISyncContext,
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::fs;

pub fn acknowledge(context: &ISyncContext<'_>) -> Result<()> {
    let directory = context.adapters.home.join("state/attempts");
    let names = fs::read_dir(&directory)
        .and_then(|names| {
            names
                .map(|name| name.map(|entry| entry.file_name()))
                .collect::<std::io::Result<Vec<_>>>()
        })
        .unwrap_or_default();
    let mut attempts = Vec::new();
    for name in names {
        let name = name.to_string_lossy().into_owned();
        let receipt = name.strip_suffix(".invalid").unwrap_or(&name);
        if receipt.len() != 43
            || !receipt
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            continue;
        }
        let path = directory.join(receipt);
        let marker = suffix(&path, ".invalid");
        let record = if name.ends_with(".invalid") {
            None
        } else {
            recover_sync_record(
                &path,
                &marker,
                |saved| decode(saved, receipt),
                (context.options.now)(),
                |m| {
                    if let Some(report) = &context.options.report {
                        report(m);
                    }
                },
            )?
        };
        if let Some(record) = record {
            attempts.push((path, record));
        } else {
            for link in context.state["links"].as_array().into_iter().flatten() {
                atomic_write(
                    &suffix(
                        &base_path(
                            &context.adapters.home,
                            link["store"].as_str().unwrap_or_default(),
                            None,
                        ),
                        ".corrupt",
                    ),
                    path.to_string_lossy().as_bytes(),
                    (context.options.now)(),
                )?;
            }
            write_bytes(&marker, None, (context.options.now)())?;
        }
    }
    attempts.sort_by_key(|(_, a)| a.sequence.parse::<u128>().unwrap_or_default());
    for (path, attempt) in attempts {
        let accepted = context
            .headers
            .iter()
            .any(|h| p::object_hash(h, "manifest").is_ok_and(|h| text(&h) == attempt.header));
        if accepted {
            apply(context, &attempt)?;
        }
        if accepted
            || u128::from(context.checkpoint.header.body.seq)
                >= attempt.sequence.parse::<u128>().unwrap_or_default()
        {
            write_bytes(&path, None, (context.options.now)())?;
        }
    }
    Ok(())
}
