use crate::{chain::devices::IDeviceListState, protocol::*};
use envden_core::errors::Result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TAuthorization {
    Unlocked,
    MailboxGrant,
    JoinTicket,
    Fresh,
    FreshOrRepairToken,
    SkProof,
    MoveSession,
    MoveImport,
    RepairToken,
}

pub fn operation_requirement(
    previous: &IManifestHeader,
    header: &IManifestHeader,
    entries: &[ISigned<TEntry>],
    before: &IDeviceListState,
    on_new_server: bool,
) -> Result<TAuthorization> {
    let op = header.op;
    require_value((1..=13).contains(&op), "Invalid chain data")?;
    require_value(
        entries.len() == usize::from(![1, 8, 11].contains(&op)),
        "Invalid chain data",
    )?;
    let epoch = [4, 5, 6, 7, 9].contains(&op);
    let envelope = [5, 7, 8, 9].contains(&op);
    let files = [1, 11].contains(&op);
    require_value(
        Some(header.epoch) == previous.epoch.checked_add(u32::from(epoch)),
        "Invalid chain data",
    )?;
    require_value(
        epoch != (header.keyring_hash == previous.keyring_hash)
            && envelope != (header.envelope_hash == previous.envelope_hash)
            && files != (header.files_hash == previous.files_hash),
        "Invalid chain data",
    )?;
    let e = entries.first().map(|e| &e.body);
    use TEntryPayload::*;
    let valid = match (op, e) {
        (1 | 8 | 11, None) => true,
        (
            2 | 3,
            Some(TEntry {
                change: AddDevice(p),
                signer,
                ..
            }),
        ) => {
            (*signer == before.recovery.id) == (op == 3)
                && (op != 3 || header.signer == p.device.id)
        }
        (
            4 | 5,
            Some(TEntry {
                change: RemoveDevice(p),
                ..
            }),
        ) => p.new_recovery.is_some() == (op == 5),
        (
            6,
            Some(TEntry {
                change: NewEpoch(_),
                ..
            }),
        ) => true,
        (
            7 | 9,
            Some(TEntry {
                change: ReplaceRecovery(_),
                ..
            }),
        ) => true,
        (
            10,
            Some(TEntry {
                change: ServerMoved(_),
                ..
            }),
        ) => true,
        (
            12,
            Some(TEntry {
                change: RepairDone(_),
                ..
            }),
        ) => true,
        (
            13,
            Some(TEntry {
                change: RenameDevice(_),
                signer,
                ..
            }),
        ) => header.signer == *signer,
        _ => false,
    };
    require_value(valid, "Invalid chain data")?;
    Ok(match op {
        1 | 13 => TAuthorization::Unlocked,
        2 => TAuthorization::MailboxGrant,
        3 => TAuthorization::JoinTicket,
        4 => TAuthorization::FreshOrRepairToken,
        5..=8 => TAuthorization::Fresh,
        9 => TAuthorization::SkProof,
        10 if on_new_server => TAuthorization::MoveImport,
        10 => TAuthorization::MoveSession,
        _ => TAuthorization::RepairToken,
    })
}
