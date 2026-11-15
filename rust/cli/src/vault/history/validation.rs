use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn stored_state(
    entries: &[p::ISigned<p::TEntry>],
    stored: Option<&c::IDeviceListState>,
    states: &mut BTreeMap<u64, c::IDeviceListState>,
) -> Result<Option<c::IDeviceListState>> {
    let stored = stored.filter(|s| {
        entries
            .iter()
            .any(|e| e.body.seq == s.seq && p::object_hash(e, "entry").is_ok_and(|h| h == s.head))
    });
    let mut state = stored.cloned();
    if let Some(state) = &state {
        states.insert(state.seq, state.clone());
    }
    for entry in entries {
        if stored.is_some_and(|s| entry.body.seq <= s.seq) {
            continue;
        }
        let c::TDeviceListResult::Valid { state: next } = c::apply_entry(state.as_ref(), entry)?
        else {
            return Err(invalid("Invalid stored device list"));
        };
        states.insert(next.seq, *next.clone());
        state = Some(*next);
    }
    Ok(state)
}

pub(super) fn verify_headers(
    headers: &[p::ISigned<p::IManifestHeader>],
    first: usize,
    states: &BTreeMap<u64, c::IDeviceListState>,
    vault_id: &[u8; 32],
) -> Result<()> {
    let mut previous = if first > 0 {
        p::object_hash(&headers[first - 1], "manifest")?
    } else {
        [0; 32]
    };
    let mut previous_epoch = if first > 0 {
        headers[first - 1].body.epoch
    } else {
        0
    };
    for (index, signed) in headers.iter().enumerate().skip(first) {
        let h = &signed.body;
        let at = states
            .get(&h.list_seq)
            .ok_or_else(|| invalid("Invalid device list"))?;
        let valid = at.devices.get(&h.signer).is_some_and(|signer| {
            h.vault_id == *vault_id
                && h.seq == index as u64 + 1
                && h.prev == previous
                && h.list_head == at.head
                && h.epoch == at.epoch
                && h.epoch >= previous_epoch
                && p::verify_object(signed, &signer.obj_pub, "manifest")
        });
        if !valid {
            return Err(invalid("Invalid manifest history"));
        }
        previous = p::object_hash(signed, "manifest")?;
        previous_epoch = h.epoch;
    }
    Ok(())
}

pub(super) fn verify_restored_heads(
    headers: &[p::ISigned<p::IManifestHeader>],
    entries: &[p::ISigned<p::TEntry>],
) -> Result<()> {
    let mut earlier = BTreeSet::new();
    let mut next = 0;
    for signed in headers {
        while next < entries.len() && entries[next].body.seq <= signed.body.list_seq {
            if let p::TEntryPayload::RepairDone(repair) = &entries[next].body.change
                && !earlier.contains(&repair.restored_head)
            {
                return Err(invalid("Invalid repair history"));
            }
            next += 1;
        }
        earlier.insert(p::object_hash(signed, "manifest")?);
    }
    Ok(())
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}
