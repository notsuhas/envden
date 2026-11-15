use crate::{identity::IDeviceIdentity, vault::history::IVaultHistory};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub fn admin_swap(
    history: &IVaultHistory,
    identity: &IDeviceIdentity,
    op: u8,
    now: u64,
    entries: Vec<p::ISigned<p::TEntry>>,
) -> Result<p::ISwap> {
    let before = history.headers.last().expect("verified history");
    let expected_head = p::object_hash(before, "manifest")?;
    let mut body = before.body.clone();
    body.seq += 1;
    body.prev = expected_head;
    body.op = op;
    body.created_at = now;
    body.signer = identity.record.id;
    if let Some(last) = entries.last() {
        body.list_seq = last.body.seq;
        body.list_head = p::object_hash(last, "entry")?;
        body.epoch = match &last.body.change {
            p::TEntryPayload::RemoveDevice(v) => v.change.epoch,
            p::TEntryPayload::NewEpoch(v) => v.change.epoch,
            p::TEntryPayload::ReplaceRecovery(v) => v.change.epoch,
            _ => body.epoch,
        };
    }
    Ok(p::ISwap {
        expected_head,
        header: p::sign_object(body, &identity.keys.obj_sk, "manifest")?,
        entries,
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    })
}
