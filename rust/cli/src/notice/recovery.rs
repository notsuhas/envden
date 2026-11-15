use crate::{
    client::{binary, text},
    notice::pending::{pending_joins, print_recovery_joins},
    state::files::{atomic_write, optional_read},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Map, Value};
use std::{collections::BTreeMap, path::Path};

pub fn recovery_joins(values: &[String], own_id: Option<&[u8; 16]>) -> Result<Map<String, Value>> {
    let signed = values
        .iter()
        .map(|v| p::decode::<p::ISigned<p::TEntry>>(&binary(v)?))
        .collect::<Result<Vec<_>>>()?;
    let mut names = BTreeMap::new();
    for event in &signed {
        match &event.body.change {
            p::TEntryPayload::Genesis(v) => {
                names.insert(v.device.id, v.device.name.clone());
            }
            p::TEntryPayload::AddDevice(v) => {
                names.insert(v.device.id, v.device.name.clone());
            }
            p::TEntryPayload::RenameDevice(v) => {
                names.insert(v.device, v.name.clone());
            }
            _ => {}
        }
    }
    let own_join = signed.iter().find_map(|e| {
        let device = match &e.body.change {
            p::TEntryPayload::Genesis(v) => Some(v.device.id),
            p::TEntryPayload::AddDevice(v) => Some(v.device.id),
            _ => None,
        };
        (device.as_ref() == own_id && own_id.is_some()).then_some(e.body.seq)
    });
    let mut recovery = None;
    let mut notices = Map::new();
    for event in signed {
        if let p::TEntryPayload::AddDevice(v) = &event.body.change
            && recovery == Some(event.body.signer)
            && own_join.is_none_or(|seq| event.body.seq > seq)
        {
            notices.insert(
                text(&p::object_hash(&event, "entry")?),
                Value::String(names[&v.device.id].clone()),
            );
        }
        recovery = match &event.body.change {
            p::TEntryPayload::Genesis(v) => Some(v.recovery.id),
            p::TEntryPayload::ReplaceRecovery(v) => Some(v.recovery.id),
            p::TEntryPayload::RemoveDevice(v) => v.new_recovery.as_ref().map(|r| r.id).or(recovery),
            _ => recovery,
        };
    }
    Ok(notices)
}

pub fn add_pending_joins(
    home: &Path,
    entries: &[String],
    own_id: &[u8; 16],
    now: u64,
) -> Result<()> {
    let mut pending = pending_joins(home)?;
    let seen: Vec<String> = serde_json::from_str(
        &optional_read(&home.join("state/recovery-notice"))?.unwrap_or_else(|| "[]".into()),
    )
    .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid recovery notice", e))?;
    for (id, name) in recovery_joins(entries, Some(own_id))? {
        if !seen.contains(&id) {
            pending.insert(id, name);
        }
    }
    atomic_write(
        &home.join("state/pending-recovery.json"),
        Value::Object(pending).to_string().as_bytes(),
        now,
    )
}

pub fn report_recovery_joins(
    home: &Path,
    state: &Value,
    own_id: Option<&[u8; 16]>,
    now: u64,
) -> Result<()> {
    let entries = state["entries"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect::<Vec<_>>();
    print_recovery_joins(home, &recovery_joins(&entries, own_id)?, now)
}
