use super::{
    descent::entry_descent,
    source::{IChainSource, needed, source_value},
};
use crate::{
    chain::devices::{IDeviceListState, apply},
    protocol::*,
};
use envden_core::errors::{ErrorCode, Result};

pub fn check_header_signature(
    source: &impl IChainSource,
    verified: &IDeviceListState,
    signed: &ISigned<IManifestHeader>,
) -> Result<()> {
    let h = &signed.body;
    require_value(h.vault_id == verified.vault_id, "Invalid chain data")?;
    let mut state = verified.clone();
    if h.list_seq >= state.seq {
        let run = || -> Result<IDeviceListState> {
            let mut s = state.clone();
            for e in entry_descent(source, s.seq, &s.head, h)? {
                s = apply(Some(&s), &e)?;
            }
            Ok(s)
        };
        state = match run() {
            Ok(s) => s,
            Err(e) if e.code == ErrorCode::InvalidData => state_from_genesis(source, h)?,
            Err(e) => return Err(e),
        };
    } else {
        state = state_from_genesis(source, h)?;
    }
    require_value(
        state.vault_id == h.vault_id && state.head == h.list_head,
        "Invalid chain data",
    )?;
    require_value(
        state
            .devices
            .get(&h.signer)
            .is_some_and(|m| verify_object(signed, &m.obj_pub, "manifest")),
        "Invalid chain data",
    )
}

fn state_from_genesis(source: &impl IChainSource, h: &IManifestHeader) -> Result<IDeviceListState> {
    let mut entries = vec![];
    let mut hash = h.list_head;
    for seq in (0..=h.list_seq).rev() {
        let e = needed(source_value(source.entry(&hash))?)?;
        require_value(e.body.seq == seq, "Invalid chain data")?;
        hash = e.body.parent;
        entries.push(e);
    }
    let mut state = None;
    for e in entries.iter().rev() {
        state = Some(apply(state.as_ref(), e)?);
    }
    needed(state)
}
