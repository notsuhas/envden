use envden_core::{adapters::*, errors::ErrorCode};
use envden_testing::storage::IFakeStorageAdapter;
#[test]
fn commit_preconditions_throw_typed_errors() {
    let storage = IFakeStorageAdapter {
        setup_token: Some(Box::new(|| Ok(None))),
        consume_session: Some(Box::new(|_, _, _| Ok(None))),
        mailbox: Some(Box::new(|_, _, _| Ok(None))),
        configure_vault: Some(Box::new(|_, _, _, _| Ok(()))),
        has_vault: Some(Box::new(|_| Ok(false))),
        ..Default::default()
    };
    for (case, code) in [
        (0, ErrorCode::Unauthorized),
        (1, ErrorCode::Unauthorized),
        (2, ErrorCode::NotFound),
        (3, ErrorCode::InvalidData),
    ] {
        let mut swap = IStoredSwap {
            header: IStoredHeader {
                hash: vec![0; 32],
                bytes: vec![],
                seq: 1,
            },
            entries: vec![],
            body_digest: vec![0; 32],
            files_hash: None,
            files: None,
            state: None,
            vault: None,
            devices: None,
            approver: None,
            consume_sessions: None,
            close_mailbox: None,
            setup_token_hash: None,
            clear_repair_reports: None,
        };
        match case {
            0 => swap.setup_token_hash = Some(vec![0; 32]),
            1 => {
                swap.consume_sessions = Some(vec![ISessionKey {
                    kind: TSessionKind::Login,
                    device: vec![0; 16],
                    purpose: "test".into(),
                }])
            }
            2 => swap.close_mailbox = Some(1),
            _ => {}
        }
        assert_eq!(
            prepare_commit(&storage, &[0; 32], &swap, 0)
                .unwrap_err()
                .code,
            code
        );
    }
}
