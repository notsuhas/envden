use super::{
    commit::finish_file,
    deletion::suffix,
    guards::{can_resume, content_hash},
    record::{IOperation, decode_operation},
};
use crate::{
    client::text,
    state::{files::atomic_write, records::recover_sync_record},
    sync::{
        local::{
            conflicts::IConflictTarget,
            files::{base_path, read_bytes, write_bytes},
        },
        remote::context::ISyncContext,
    },
};
use base64::{Engine, engine::general_purpose::STANDARD};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::path::Path;

pub fn commit_file(
    context: &mut ISyncContext<'_>,
    targets: &[IConflictTarget],
    store: &str,
    next: Option<&[u8]>,
    server: Option<&[u8]>,
    entry: Option<&str>,
) -> Result<()> {
    let before = hashes(context, store, targets)?;
    let hash = content_hash(next);
    let record = IOperation {
        targets: targets.to_vec(),
        written: before.iter().map(|h| *h == hash).collect(),
        before,
        next: next.map(|b| STANDARD.encode(b)),
        server: server.map(|b| STANDARD.encode(b)),
        header: text(&p::object_hash(&context.checkpoint.header, "manifest")?),
        entry: entry.map(str::to_owned),
    };
    let path = suffix(&base_path(&context.adapters.home, store, None), ".pending");
    atomic_write(
        &path,
        serde_json::to_string(&record).unwrap().as_bytes(),
        (context.options.now)(),
    )?;
    resume_file(context, store)
}

pub fn resume_file(context: &mut ISyncContext<'_>, store: &str) -> Result<()> {
    let base = base_path(&context.adapters.home, store, None);
    let path = suffix(&base, ".pending");
    let operation = recover_sync_record(
        &path,
        &suffix(&base, ".corrupt"),
        decode_operation,
        (context.options.now)(),
        |m| {
            if let Some(report) = &context.options.report {
                report(m);
            }
        },
    )?;
    let Some(mut operation) = operation else {
        return Ok(());
    };
    let next = decode_bytes(operation.next.as_deref())?;
    let server = decode_bytes(operation.server.as_deref())?;
    let current = hashes(context, store, &operation.targets)?;
    let hash = content_hash(next.as_deref());
    for (written, current) in operation.written.iter_mut().zip(&current) {
        *written |= *current == hash;
    }
    if operation.written[0] {
        if let Some(entry) = &operation.entry {
            atomic_write(
                &suffix(&base, ".entry"),
                entry.as_bytes(),
                (context.options.now)(),
            )?;
        }
        write_bytes(&base, next.as_deref(), (context.options.now)())?;
    }
    for (index, target) in operation.targets.iter().enumerate() {
        if target.mode == "copy" && operation.written[index + 1] {
            write_bytes(
                &base_path(&context.adapters.home, store, Some(&target.root)),
                next.as_deref(),
                (context.options.now)(),
            )?;
        }
    }
    if operation.header != text(&p::object_hash(&context.checkpoint.header, "manifest")?)
        || !can_resume(
            &operation.before,
            &current,
            hash.as_deref(),
            &operation.written,
        )
    {
        return write_bytes(&path, None, (context.options.now)());
    }
    finish_file(
        context,
        &operation.targets,
        store,
        next.as_deref(),
        server.as_deref(),
        operation.entry.as_deref(),
    )?;
    write_bytes(&path, None, (context.options.now)())
}

fn hashes(
    context: &ISyncContext<'_>,
    store: &str,
    targets: &[IConflictTarget],
) -> Result<Vec<Option<String>>> {
    let stored = read_bytes(Path::new(store))?;
    let mut hashes = vec![content_hash(stored.as_deref())];
    for target in targets {
        let snapshot = super::super::snapshot::snapshot(context, target, stored.as_deref(), None)?;
        hashes.push(content_hash(snapshot.bytes.as_deref()));
    }
    Ok(hashes)
}

fn decode_bytes(value: Option<&str>) -> Result<Option<Vec<u8>>> {
    value
        .map(|v| {
            STANDARD.decode(v).map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid placement record", e)
            })
        })
        .transpose()
}
