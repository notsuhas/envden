use crate::protocol::*;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IDeviceListState {
    pub vault_id: [u8; 32],
    pub seq: u64,
    pub head: [u8; 32],
    pub devices: BTreeMap<[u8; 16], IDeviceRecord>,
    pub recovery: IRecoveryRecord,
    pub epoch: u32,
    pub server_pin: [u8; 32],
    pub ever_used_ids: BTreeSet<[u8; 16]>,
    pub repair_ids: BTreeSet<[u8; 32]>,
    pub commits: BTreeMap<u32, [u8; 32]>,
}

#[derive(Debug, Clone)]
pub enum TDeviceListResult {
    Valid { state: Box<IDeviceListState> },
    Invalid,
}
