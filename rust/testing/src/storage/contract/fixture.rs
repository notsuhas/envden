use envden_core::adapters::*;
use std::sync::Arc;
pub struct IStorageFixture {
    pub storage: Arc<dyn IStorageAdapter>,
    pub reopen: Box<dyn Fn() -> Arc<dyn IStorageAdapter>>,
    pub dispose: Box<dyn Fn()>,
}
impl Drop for IStorageFixture {
    fn drop(&mut self) {
        (self.dispose)();
    }
}
pub(super) fn vault() -> IStoredVault {
    IStoredVault {
        active: true,
        ..Default::default()
    }
}
pub(super) fn swap(value: u8) -> IStoredSwap {
    IStoredSwap {
        header: IStoredHeader {
            seq: value as u64,
            hash: vec![value],
            bytes: vec![value + 10],
        },
        entries: vec![],
        body_digest: vec![value + 20],
        vault: Some(vault()),
        files_hash: None,
        files: None,
        state: None,
        devices: None,
        approver: None,
        consume_sessions: None,
        close_mailbox: None,
        setup_token_hash: None,
        clear_repair_reports: None,
    }
}
