use super::context::ISwapContext;
use crate::{
    chain::manifests::{changed_files, checked_files},
    protocol::*,
};
use envden_core::errors::Result;

pub fn check_payload(s: &ISwap, c: &ISwapContext) -> Result<()> {
    let h = &s.header.body;
    let p = &c.previous.body;
    let op = h.op;
    if let Some(ISigned {
        body: TEntry {
            change: TEntryPayload::RepairDone(done),
            ..
        },
        ..
    }) = s.entries.first()
    {
        require_value(
            done.restored_head == s.expected_head
                || c.ancestor_header_hashes.contains(&done.restored_head),
            "Invalid chain data",
        )?;
    }
    for (present, required) in [
        (s.files.is_some(), [1, 11].contains(&op)),
        (s.keyring.is_some(), [4, 5, 6, 7, 9].contains(&op)),
        (s.envelope.is_some(), [5, 7, 8, 9].contains(&op)),
        (s.sk_pub.is_some(), [5, 7].contains(&op)),
        (
            s.opaque_record.is_some(),
            [8, 9].contains(&op) || (op == 12 && c.repair_registration_required),
        ),
        (s.approver.is_some(), op == 2),
    ] {
        require_value(present == required, "Invalid chain data")?;
    }
    if let Some(k) = &s.sk_pub {
        validate_ed_public(k)?;
    }
    if let Some(r) = &s.opaque_record {
        require_value(r.len() == 192, "Invalid chain data")?;
    }
    if let Some(a) = &s.approver {
        require_value(a.len() <= 4096, "Invalid chain data")?;
    }
    if let Some(k) = &s.keyring {
        require_value(
            h.keyring_hash == h_hash("keyring-blob", k),
            "Invalid chain data",
        )?;
    }
    if let Some(e) = &s.envelope {
        require_value(
            h.envelope_hash == h_hash("envelope-blob", e),
            "Invalid chain data",
        )?;
    }
    if let Some(files) = &s.files {
        checked_files(Some(&c.files), &p.files_hash)?;
        let changes = changed_files(
            &c.files,
            &checked_files(Some(files), &h.files_hash)?,
            p.epoch,
            h.epoch,
            Some(op),
        )?;
        if op == 11 {
            require_value(
                changes.iter().all(|e| {
                    c.files
                        .entries
                        .iter()
                        .find(|v| v.file_id == e.file_id)
                        .is_some_and(|old| c.missing_blobs.contains(&old.blob_hash))
                }),
                "Invalid chain data",
            )?;
        }
    }
    Ok(())
}
use crate::protocol::h as h_hash;
