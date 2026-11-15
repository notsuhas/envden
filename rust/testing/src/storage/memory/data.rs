use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode},
};
use indexmap::{IndexMap, IndexSet};
use parking_lot::ReentrantMutex;
use std::cell::RefCell;
pub(super) type TBytes = Vec<u8>;
pub(super) type TPair = (TBytes, TBytes);
pub(super) type TSession = (TBytes, ISessionKey);
pub(super) type TState = (TBytes, TStateKind, TBytes);
#[derive(Clone, Default)]
pub(super) struct IData {
    pub vaults: IndexMap<TBytes, IStoredVault>,
    pub heads: IndexMap<TBytes, TBytes>,
    pub headers: IndexMap<TBytes, Vec<IStoredHeader>>,
    pub entries: IndexMap<TBytes, Vec<IStoredHeader>>,
    pub digests: IndexSet<TPair>,
    pub lists: IndexMap<TPair, (IStoredFiles, u64, bool)>,
    pub current: IndexMap<TBytes, TBytes>,
    pub states: IndexMap<TState, TBytes>,
    pub devices: IndexMap<TPair, IStoredDevice>,
    pub blobs: IndexMap<TPair, (TBytes, u64)>,
    pub setup: Option<TBytes>,
    pub sessions: IndexMap<TSession, (TBytes, u64)>,
    pub nonces: IndexMap<TPair, u64>,
    pub approvers: IndexMap<TPair, (TBytes, u64)>,
    pub mailboxes: IndexMap<u64, (TBytes, IStoredMailbox)>,
    pub openings: IndexMap<TBytes, Vec<u64>>,
    pub buckets: IndexMap<String, (u64, u32)>,
    pub charges: IndexMap<String, (String, u64)>,
    pub receipt: u64,
    pub depth: usize,
}
#[derive(Default)]
pub(super) struct IMemory {
    pub data: ReentrantMutex<RefCell<IData>>,
}
pub(super) fn fail(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}
pub(super) fn pair(a: &[u8], b: &[u8]) -> TPair {
    (a.to_vec(), b.to_vec())
}
pub(super) fn range(
    rows: Option<&Vec<IStoredHeader>>,
    from: u64,
    to: u64,
    limit: Option<usize>,
    max_bytes: Option<usize>,
) -> Vec<IStoredHeader> {
    let mut rows: Vec<_> = rows
        .into_iter()
        .flatten()
        .filter(|r| r.seq >= from && r.seq <= to)
        .cloned()
        .collect();
    rows.sort_by_key(|r| r.seq);
    rows.truncate(limit.unwrap_or(usize::MAX));
    let mut size = 0;
    rows.into_iter()
        .enumerate()
        .filter_map(|(i, r)| {
            size += r.bytes.len();
            (size <= max_bytes.unwrap_or(usize::MAX) || i == 0).then_some(r)
        })
        .collect()
}
