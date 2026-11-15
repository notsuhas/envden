use super::state::*;
use crate::protocol::*;
use TEntryPayload::*;
use envden_core::errors::{ErrorCode, Result};

fn check(b: bool) -> Result<()> {
    require_value(b, "Invalid chain data")
}

pub fn apply_entry(
    state: Option<&IDeviceListState>,
    entry: &ISigned<TEntry>,
) -> Result<TDeviceListResult> {
    match apply(state, entry) {
        Ok(state) => Ok(TDeviceListResult::Valid {
            state: Box::new(state),
        }),
        Err(e) if e.code == ErrorCode::InvalidData => Ok(TDeviceListResult::Invalid),
        Err(e) => Err(e),
    }
}

pub fn verify_chain(entries: &[ISigned<TEntry>]) -> Result<TDeviceListResult> {
    let mut state = None;
    for e in entries {
        match apply_entry(state.as_ref(), e)? {
            TDeviceListResult::Valid { state: s } => state = Some(*s),
            TDeviceListResult::Invalid => return Ok(TDeviceListResult::Invalid),
        }
    }
    Ok(state.map_or(TDeviceListResult::Invalid, |state| {
        TDeviceListResult::Valid {
            state: Box::new(state),
        }
    }))
}

pub fn apply(
    state: Option<&IDeviceListState>,
    signed: &ISigned<TEntry>,
) -> Result<IDeviceListState> {
    let e = &signed.body;
    let encoded = encode(e)?;
    require_value(signed.signature.len() == 64, "Wrong byte length")?;
    let head = h(
        "hash/entry",
        &[encoded.as_slice(), &signed.signature].concat(),
    );
    let Some(state) = state else {
        let Genesis(p) = &e.change else {
            check(false)?;
            unreachable!()
        };
        check(e.seq == 0 && e.vault_id == [0; 32] && e.parent == [0; 32])?;
        check(
            e.signer == p.device.id
                && verify(&p.device.obj_pub, "entry", &encoded, &signed.signature)
                && p.device.id != p.recovery.id,
        )?;
        return Ok(IDeviceListState {
            vault_id: head,
            seq: 0,
            head,
            devices: [(p.device.id, p.device.clone())].into(),
            recovery: p.recovery.clone(),
            epoch: 0,
            server_pin: p.server_pin,
            ever_used_ids: [p.device.id, p.recovery.id].into(),
            repair_ids: Default::default(),
            commits: Default::default(),
        });
    };
    check(
        e.vault_id == state.vault_id
            && Some(e.seq) == state.seq.checked_add(1)
            && e.parent == state.head,
    )?;
    check(e.seq != 1 || matches!(e.change, NewEpoch(_)))?;
    let signer = state.devices.get(&e.signer);
    check(signer.is_some() || (e.signer == state.recovery.id && matches!(e.change, AddDevice(_))))?;
    let public = signer.map_or(&state.recovery.obj_pub, |s| &s.obj_pub);
    check(verify(public, "entry", &encoded, &signed.signature))?;
    let mut next = state.clone();
    super::mutate::transition(&mut next, e)?;
    let changed = matches!(e.change, ReplaceRecovery(_))
        || matches!(&e.change,RemoveDevice(p) if p.new_recovery.is_some());
    if changed {
        check(next.ever_used_ids.insert(next.recovery.id))?;
    }
    let change = match &e.change {
        RemoveDevice(p) => Some(&p.change),
        NewEpoch(p) => Some(&p.change),
        ReplaceRecovery(p) => Some(&p.change),
        _ => None,
    };
    if let Some(c) = change {
        check(Some(c.epoch) == state.epoch.checked_add(1))?;
        let members: std::collections::BTreeSet<_> = next
            .devices
            .keys()
            .copied()
            .chain(std::iter::once(next.recovery.id))
            .collect();
        check(
            c.wraps.len() == members.len()
                && c.wraps.iter().all(|w| members.contains(&w.recipient)),
        )?;
        next.epoch = c.epoch;
        next.commits.insert(c.epoch, c.key_commit);
    }
    next.seq = e.seq;
    next.head = head;
    Ok(next)
}
