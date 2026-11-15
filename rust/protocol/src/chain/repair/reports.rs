use crate::{chain::devices::state::IDeviceListState, protocol::*};
use std::collections::BTreeSet;

pub fn filter_repair_reports(
    reports: &[ISigned<IRepairReport>],
    repair_id: &[u8; 32],
    state: &IDeviceListState,
    headers: &BTreeSet<[u8; 32]>,
) -> Vec<ISigned<IRepairReport>> {
    reports
        .iter()
        .filter(|v| {
            let r = &v.body;
            state.devices.get(&r.signer).is_some_and(|s| {
                r.vault_id == state.vault_id
                    && r.repair_id == *repair_id
                    && headers.contains(&r.head)
                    && verify_object(v, &s.obj_pub, "repair-report")
            })
        })
        .cloned()
        .collect()
}

pub fn missing_report_members(
    state: &IDeviceListState,
    reports: &[ISigned<IRepairReport>],
) -> Vec<IDeviceRecord> {
    state
        .devices
        .values()
        .filter(|d| !reports.iter().any(|r| r.body.signer == d.id))
        .cloned()
        .collect()
}

pub fn classify_missing_blobs(
    files: &IFiles,
    available: &BTreeSet<[u8; 32]>,
    reports: &[ISigned<IRepairReport>],
) -> (Vec<IFileEntry>, Vec<IFileEntry>) {
    files
        .entries
        .iter()
        .filter(|e| [1, 3].contains(&e.state) && !available.contains(&e.blob_hash))
        .cloned()
        .partition(|e| reports.iter().any(|r| r.body.blobs.contains(&e.blob_hash)))
}
