use super::{
    context::ISwapContext,
    operation::{TAuthorization, operation_requirement},
    payload::check_payload,
};
use crate::{
    chain::devices::{IDeviceListState, apply},
    protocol::*,
};
use envden_core::errors::{ErrorCode, Result};

pub enum TSwapResult {
    Valid {
        authorization: TAuthorization,
        state: Box<IDeviceListState>,
    },
    Invalid,
}

pub fn validate_swap(s: &ISwap, c: &ISwapContext) -> Result<TSwapResult> {
    let run = || -> Result<TSwapResult> {
        encode(s)?;
        let h = &s.header.body;
        let p = &c.previous.body;
        require_value(
            s.expected_head == object_hash(&c.previous, "manifest")?
                && h.prev == s.expected_head
                && Some(h.seq) == p.seq.checked_add(1),
            "Invalid chain data",
        )?;
        require_value(
            h.vault_id == c.state.vault_id
                && p.list_seq == c.state.seq
                && p.list_head == c.state.head,
            "Invalid chain data",
        )?;
        let mut state = c.state.clone();
        for entry in &s.entries {
            state = apply(Some(&state), entry)?;
        }
        let authorization =
            operation_requirement(p, h, &s.entries, &c.state, c.destination_pin.is_some())?;
        require_value(
            h.list_seq == state.seq && h.list_head == state.head && h.epoch == state.epoch,
            "Invalid chain data",
        )?;
        require_value(
            state
                .devices
                .get(&h.signer)
                .is_some_and(|m| verify_object(&s.header, &m.obj_pub, "manifest")),
            "Invalid chain data",
        )?;
        require_value(
            c.request_signer == h.signer
                || (h.op == 10
                    && c.destination_pin.is_some()
                    && state.devices.contains_key(&c.request_signer)),
            "Invalid chain data",
        )?;
        if h.op == 10
            && let Some(pin) = c.destination_pin
        {
            require_value(
                matches!(s.entries.first().map(|e|&e.body.change),Some(TEntryPayload::ServerMoved(p)) if p.new_pin==pin),
                "Invalid chain data",
            )?;
        }
        check_payload(s, c)?;
        Ok(TSwapResult::Valid {
            authorization,
            state: Box::new(state),
        })
    };
    match run() {
        Err(e) if e.code == ErrorCode::InvalidData => Ok(TSwapResult::Invalid),
        r => r,
    }
}
