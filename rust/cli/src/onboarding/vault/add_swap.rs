use crate::{identity::IDeviceIdentity, vault::history::IVaultHistory};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};

pub(crate) fn add_swap(
    history: &IVaultHistory,
    mut device: p::IDeviceRecord,
    signing: ([u8; 16], &[u8; 32]),
    epoch_key: &[u8; 32],
    op: u8,
    identity: &IDeviceIdentity,
    now: u64,
) -> Result<p::ISwap> {
    let (signer, sk) = signing;
    let state = &history.state;
    device.name = crate::identity::name::unique_device_name(
        &device.name,
        state.devices.values().map(|v| v.name.as_str()),
    );
    let wrap = p::seal_wrap(
        epoch_key,
        &state.vault_id,
        state.epoch,
        &device.id,
        &device.enc_pub,
        &p::random_bytes(),
    )?;
    let entry = p::sign_object(
        p::TEntry {
            vault_id: state.vault_id,
            seq: state.seq + 1,
            parent: state.head,
            signer,
            change: p::TEntryPayload::AddDevice(p::IAddDevice { device, wrap }),
        },
        sk,
        "entry",
    )?;
    if !matches!(
        c::apply_entry(Some(state), &entry)?,
        c::TDeviceListResult::Valid { .. }
    ) {
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Device name or keys cannot be added",
        ));
    }
    let before = history.headers.last().expect("verified history");
    let expected_head = p::object_hash(before, "manifest")?;
    let mut header = before.body.clone();
    header.seq += 1;
    header.prev = expected_head;
    header.op = op;
    header.list_seq = entry.body.seq;
    header.list_head = p::object_hash(&entry, "entry")?;
    header.created_at = now;
    header.signer = identity.record.id;
    Ok(p::ISwap {
        expected_head,
        entries: vec![entry],
        header: p::sign_object(header, &identity.keys.obj_sk, "manifest")?,
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    })
}
