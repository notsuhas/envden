use super::support::vault;
use envden_core::adapters::*;

pub fn swap(i: u8) -> IStoredSwap {
    IStoredSwap {
        header: IStoredHeader {
            seq: i as u64,
            hash: vec![i],
            bytes: vec![i],
        },
        entries: vec![],
        files_hash: None,
        files: None,
        body_digest: vec![i],
        state: None,
        vault: Some(vault(true)),
        devices: None,
        approver: None,
        consume_sessions: None,
        close_mailbox: None,
        setup_token_hash: None,
        clear_repair_reports: None,
    }
}
