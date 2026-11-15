use crate::{
    chain::devices::{IDeviceListState, TDeviceListResult, verify_chain},
    protocol::*,
};
use envden_core::errors::Result;
use std::collections::BTreeSet;

pub struct INonMemberInput<'a> {
    pub device_id: [u8; 16],
    pub stored_headers: &'a [ISigned<IManifestHeader>],
    pub stored_entries: &'a [ISigned<TEntry>],
    pub verified_headers: &'a [ISigned<IManifestHeader>],
    pub verified_entries: &'a [ISigned<TEntry>],
    pub state: &'a IDeviceListState,
}

pub enum TNonMember {
    Removed { entry: Box<ISigned<TEntry>> },
    DroppedByRepair,
    Rollback,
    Fork,
}

pub fn classify_non_member(i: INonMemberInput<'_>) -> Result<TNonMember> {
    let (Some(checkpoint), Some(head)) = (i.stored_headers.last(), i.verified_headers.last())
    else {
        return Ok(TNonMember::Fork);
    };
    let stored: BTreeSet<_> = i
        .stored_headers
        .iter()
        .map(|h| object_hash(h, "manifest"))
        .collect::<Result<_>>()?;
    let verified: Vec<_> = i
        .verified_headers
        .iter()
        .map(|h| object_hash(h, "manifest"))
        .collect::<Result<_>>()?;
    let descends = verified.contains(&object_hash(checkpoint, "manifest")?);
    let fallback = if stored.contains(&object_hash(head, "manifest")?) {
        TNonMember::Rollback
    } else {
        TNonMember::Fork
    };
    if i.state.devices.contains_key(&i.device_id) {
        return Ok(fallback);
    }
    if descends {
        if let Some(e) = i.verified_entries.iter().find(|e| {
            e.body.seq > checkpoint.body.list_seq
                && matches!(&e.body.change,TEntryPayload::RemoveDevice(p) if p.device==i.device_id)
        }) {
            return Ok(TNonMember::Removed {
                entry: Box::new(e.clone()),
            });
        }
    } else if dropped(&i, checkpoint, &stored, &verified)? {
        return Ok(TNonMember::DroppedByRepair);
    }
    Ok(fallback)
}

fn dropped(
    i: &INonMemberInput<'_>,
    checkpoint: &ISigned<IManifestHeader>,
    stored: &BTreeSet<[u8; 32]>,
    verified: &[[u8; 32]],
) -> Result<bool> {
    let Some(split) = verified.iter().position(|h| !stored.contains(h)) else {
        return Ok(false);
    };
    if split < 1 {
        return Ok(false);
    }
    let entries: Vec<_> = i
        .stored_entries
        .iter()
        .filter(|e| e.body.seq <= checkpoint.body.list_seq)
        .cloned()
        .collect();
    let TDeviceListResult::Valid { state } = verify_chain(&entries)? else {
        return Ok(false);
    };
    if state.head != checkpoint.body.list_head {
        return Ok(false);
    }
    let former: BTreeSet<_> = state
        .ever_used_ids
        .iter()
        .filter(|m| !state.devices.contains_key(*m) && **m != state.recovery.id)
        .copied()
        .collect();
    let after: Vec<_> = i
        .verified_entries
        .iter()
        .filter(|e| e.body.seq > i.verified_headers[split - 1].body.list_seq)
        .collect();
    let acts = i
        .state
        .devices
        .keys()
        .chain(std::iter::once(&i.state.recovery.id))
        .any(|m| former.contains(m))
        || after.iter().any(|e| former.contains(&e.body.signer))
        || i.verified_headers[split..]
            .iter()
            .any(|h| former.contains(&h.body.signer));
    Ok(!acts&&after.iter().any(|e|matches!(&e.body.change,TEntryPayload::RepairDone(p) if verified[..split].contains(&p.restored_head))))
}
