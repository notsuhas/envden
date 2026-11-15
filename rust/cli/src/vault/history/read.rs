use super::validation::{stored_state, verify_headers, verify_restored_heads};
use crate::{
    client::{IClient, binary, decode_history_entries, decode_history_header},
    version::VERSION,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::collections::BTreeMap;

pub struct IVaultHistory {
    pub entries: Vec<p::ISigned<p::TEntry>>,
    pub headers: Vec<p::ISigned<p::IManifestHeader>>,
    pub state: c::IDeviceListState,
    pub states: BTreeMap<u64, c::IDeviceListState>,
}

#[derive(Default)]
pub struct ILocalHistory {
    pub entries: Vec<String>,
    pub headers: Vec<String>,
    pub latest: Option<String>,
    pub verified_state: Option<c::IDeviceListState>,
}

fn objects(client: &IClient, path: &str, mut from: u64) -> Result<Vec<String>> {
    let mut result = vec![];
    loop {
        let response = client.request(&format!("{path}?from={from}"), "GET", None)?;
        let page: p::IObjectsResponse =
            serde_json::from_value(response.json()?).map_err(|cause| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", cause)
            })?;
        let Some(last) = page.objects.last() else {
            return Ok(result);
        };
        let raw = binary(last)?;
        let bytes = raw
            .get(34..42)
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Truncated data"))?;
        let seq = u64::from_be_bytes(bytes.try_into().expect("fixed length"));
        if seq < from {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Invalid history page",
            ));
        }
        result.extend(page.objects);
        from = seq
            .checked_add(1)
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid history page"))?;
    }
}

pub fn read_history(
    client: &IClient,
    vault_id: &[u8; 32],
    local: Option<&ILocalHistory>,
) -> Result<IVaultHistory> {
    let empty = ILocalHistory::default();
    let local = local.unwrap_or(&empty);
    let stored_entries: Vec<_> = local
        .entries
        .iter()
        .map(|v| binary(v))
        .collect::<Result<_>>()?;
    let stored_headers: Vec<_> = local
        .headers
        .iter()
        .map(|v| binary(v))
        .collect::<Result<_>>()?;
    let mut entries: Vec<p::ISigned<p::TEntry>> = stored_entries
        .iter()
        .map(|v| p::decode(v))
        .collect::<Result<_>>()?;
    let mut headers: Vec<p::ISigned<p::IManifestHeader>> = stored_headers
        .iter()
        .map(|v| p::decode(v))
        .collect::<Result<_>>()?;
    let mut states = BTreeMap::new();
    let state = stored_state(&entries, local.verified_state.as_ref(), &mut states)?;
    let incoming = objects(
        client,
        "/v1/entries",
        entries.last().map_or(0, |e| e.body.seq + 1),
    )?;
    let raw: Vec<_> = incoming.iter().map(|v| binary(v)).collect::<Result<_>>()?;
    let latest = local.latest.as_deref().unwrap_or(VERSION);
    let decoded = decode_history_entries(&raw, &stored_entries, latest, state)?;
    entries.extend(decoded.entries);
    states.extend(decoded.states);
    let state = decoded.state;
    let first_header = headers.len();
    let incoming_headers = objects(
        client,
        "/v1/headers",
        headers.last().map_or(1, |h| h.body.seq + 1),
    )?;
    for value in incoming_headers {
        headers.push(decode_history_header(
            &binary(&value)?,
            &entries,
            &stored_headers,
            latest,
            Some(&states),
        )?);
    }
    if state.vault_id != *vault_id || headers.is_empty() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Invalid vault history",
        ));
    }
    verify_headers(&headers, first_header, &states, vault_id)?;
    verify_restored_heads(&headers, &entries)?;
    let final_header = &headers.last().expect("nonempty").body;
    if final_header.list_seq != state.seq || final_header.list_head != state.head {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Uncommitted device list entries",
        ));
    }
    Ok(IVaultHistory {
        entries,
        headers,
        state,
        states,
    })
}
