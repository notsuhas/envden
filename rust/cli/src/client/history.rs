use super::decode_untrusted;
use crate::version::VERSION;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::collections::BTreeMap;

pub struct IHistory {
    pub entries: Vec<p::ISigned<p::TEntry>>,
    pub state: c::IDeviceListState,
    pub states: BTreeMap<u64, c::IDeviceListState>,
}

fn history_object<T: p::ICodec>(
    raw: &[u8],
    label: &str,
    state: &c::IDeviceListState,
    stored: &[Vec<u8>],
    latest: &str,
) -> Result<p::ISigned<T>> {
    let mut members: Vec<_> = state.devices.values().map(|d| (d.id, d.obj_pub)).collect();
    if label == "entry" {
        members.push((state.recovery.id, state.recovery.obj_pub));
    }
    let result = c::decode_server_object(
        c::IUnknownData {
            received: raw,
            stored: stored
                .iter()
                .find(|s| s.get(34..42) == raw.get(34..42))
                .map(Vec::as_slice),
            mismatch: c::TUnknownData::Fork,
            unknown_format: false,
            current_version: VERSION,
            latest_version: latest,
        },
        &members,
        label,
    )?;
    match result {
        c::TServerObject::Known { value } => Ok(value),
        c::TServerObject::Unknown(kind) => {
            let (code, message) = match kind {
                c::TUnknownData::Fork => (ErrorCode::Fork, "Server history forked"),
                c::TUnknownData::Rollback => (ErrorCode::Rollback, "Server history rolled back"),
                c::TUnknownData::UpdateRequired => (
                    ErrorCode::UpdateRequired,
                    "Update envden to read server data",
                ),
                c::TUnknownData::Unreadable => {
                    (ErrorCode::InvalidData, "Unreadable data from server")
                }
                _ => (ErrorCode::InvalidData, "Invalid data from server"),
            };
            Err(EnvdenError::new(code, message))
        }
    }
}

pub fn decode_history_entries(
    raw: &[Vec<u8>],
    stored: &[Vec<u8>],
    latest: &str,
    initial: Option<c::IDeviceListState>,
) -> Result<IHistory> {
    let mut entries = Vec::new();
    let mut states = BTreeMap::new();
    let mut state = initial;
    if let Some(state) = &state {
        states.insert(state.seq, state.clone());
    }
    for bytes in raw {
        let entry = match &state {
            Some(state) => history_object(bytes, "entry", state, stored, latest)?,
            None => decode_untrusted(bytes)?,
        };
        let c::TDeviceListResult::Valid { state: next } = c::apply_entry(state.as_ref(), &entry)?
        else {
            return Err(invalid_list());
        };
        states.insert(next.seq, *next.clone());
        state = Some(*next);
        entries.push(entry);
    }
    Ok(IHistory {
        entries,
        state: state
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing device list"))?,
        states,
    })
}

pub fn decode_history_header(
    raw: &[u8],
    entries: &[p::ISigned<p::TEntry>],
    stored: &[Vec<u8>],
    latest: &str,
    states: Option<&BTreeMap<u64, c::IDeviceListState>>,
) -> Result<p::ISigned<p::IManifestHeader>> {
    let seq = if raw.starts_with(&[2, 1]) {
        let bytes = raw
            .get(75..83)
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Truncated data"))?;
        u64::from_be_bytes(bytes.try_into().expect("fixed length"))
    } else {
        entries.last().map_or(0, |e| e.body.seq)
    };
    let state = if let Some(cached) = states.and_then(|s| s.get(&seq)) {
        cached.clone()
    } else {
        let prefix: Vec<_> = entries
            .iter()
            .filter(|e| e.body.seq <= seq)
            .cloned()
            .collect();
        let c::TDeviceListResult::Valid { state } = c::verify_chain(&prefix)? else {
            return Err(invalid_list());
        };
        *state
    };
    history_object(raw, "manifest", &state, stored, latest)
}

fn invalid_list() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, "Invalid device list")
}
