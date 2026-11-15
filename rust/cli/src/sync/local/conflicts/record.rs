use super::{IConflictRecord, IConflictTarget, conflict_records, save_conflicts};
use crate::{output::sanitize_terminal, sync::local::files::write_bytes};
use envden_core::{
    errors::Result,
    merge::{ILabels, TMarked, mark_conflicts},
};
use envden_protocol::protocol::base32;
use sha2::{Digest, Sha256};
use std::path::Path;

pub struct IConflictSeed {
    pub cwd: Option<String>,
    pub entry: Option<String>,
    pub store: String,
    pub root: String,
    pub path: String,
    pub mode: String,
    pub base: String,
    pub targets: Vec<IConflictTarget>,
}

pub struct IConflictSides<'a> {
    pub mine: Option<&'a [u8]>,
    pub server: Option<&'a [u8]>,
    pub previous: Option<&'a [u8]>,
    pub tombstone: bool,
}

pub fn record_conflict(
    home: &Path,
    target: IConflictSeed,
    sides: &IConflictSides<'_>,
    variants: &[Option<&[u8]>],
    device: Option<&str>,
    now: u64,
) -> Result<Option<String>> {
    let mut records = conflict_records(home)?;
    if records.iter().any(|r| r.base == target.base) {
        return Ok(None);
    }
    let file = home
        .join("conflicts")
        .join(base32(&Sha256::digest(target.base.as_bytes())))
        .to_string_lossy()
        .into_owned();
    let marked = sides.mine.zip(sides.server).map(|(mine, server)| {
        mark_conflicts(
            sides.previous,
            mine,
            server,
            &ILabels {
                mine: "this device".into(),
                theirs: device.map_or_else(|| "server".into(), |d| format!("server (from {d})")),
            },
        )
    });
    let (marked_bytes, keys) = match &marked {
        Some(TMarked::Keys { bytes, keys }) => (Some(bytes.as_slice()), Some(keys.as_slice())),
        Some(TMarked::File { bytes }) => (Some(bytes.as_slice()), None),
        None => (None, None),
    };
    write_bytes(Path::new(&file), marked_bytes.or(sides.mine), now)?;
    write_bytes(Path::new(&format!("{file}.server")), sides.server, now)?;
    write_bytes(Path::new(&format!("{file}.mine")), sides.mine, now)?;
    write_bytes(
        Path::new(&format!("{file}.remote")),
        variants.get(1).copied().flatten(),
        now,
    )?;
    let mut alternatives = Vec::new();
    for (index, bytes) in variants.iter().enumerate() {
        if bytes.is_none() || variants[..index].contains(bytes) {
            continue;
        }
        let path = format!("{file}.variant-{index}");
        write_bytes(Path::new(&path), *bytes, now)?;
        alternatives.push(path);
    }
    let absolute = Path::new(&target.root).join(&target.path);
    let shown = target
        .cwd
        .as_deref()
        .and_then(|cwd| absolute.strip_prefix(cwd).ok())
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(&absolute)
        .to_string_lossy()
        .into_owned();
    let where_ = device.unwrap_or("the server");
    let cause = if sides.tombstone {
        format!("deleted on {where_} and changed here")
    } else if sides.server.is_none() {
        "this device has two different versions".into()
    } else if sides.mine.is_none() {
        format!("deleted here and changed on {where_}")
    } else if let Some(keys) = keys.filter(|keys| !keys.is_empty()) {
        format!("{} changed here and on {where_}", keys.join(", "))
    } else {
        format!("changed here and on {where_}")
    };
    let next = if marked.is_some() {
        format!("Edit {file}, then run envden resolve {shown}")
    } else {
        format!(
            "Run envden resolve {shown} with --keep-mine or --take-server, or edit {file} first"
        )
    };
    records.push(IConflictRecord {
        remote: format!("{file}.remote"),
        alternatives,
        targets: target.targets,
        entry: target.entry,
        store: target.store,
        root: target.root,
        path: target.path,
        mode: target.mode,
        base: target.base,
        server: format!("{file}.server"),
        mine: format!("{file}.mine"),
        file,
        deleted: sides.tombstone,
        mine_deleted: sides.mine.is_none(),
    });
    save_conflicts(home, &records, now)?;
    Ok(Some(sanitize_terminal(&format!(
        "Conflict in {shown}: {cause}. {next}"
    ))))
}
