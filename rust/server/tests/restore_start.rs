mod fixture;
use envden_core::adapters::storage::{
    IStateWrite, IStoredHeader, IStoredSwap, IStoredVault, TStateKind,
};
use envden_protocol::protocol::{TTokenKind, decode_token};
use envden_server::repair::start_restored;

#[test]
fn restores_active_vaults_but_preserves_moving_and_moved() {
    let (_directory, options) = fixture::fixture();
    let storage = options.storage.as_ref();
    for (index, active, moved) in [(1, true, false), (2, false, false), (3, true, true)] {
        let id = vec![index; 32];
        let vault = IStoredVault {
            active,
            frozen: true,
            server_moved: if moved { Some(vec![9; 32]) } else { None },
            ..Default::default()
        };
        storage
            .configure_vault(
                &id,
                &vault,
                &[IStateWrite {
                    kind: TStateKind::MoveSession,
                    key: vec![],
                    bytes: Some(vec![8; 16]),
                }],
                None,
            )
            .unwrap();
        storage
            .commit_swap(
                &id,
                None,
                &IStoredSwap {
                    header: IStoredHeader {
                        hash: vec![index + 10; 32],
                        bytes: vec![1],
                        seq: 1,
                    },
                    entries: vec![],
                    files_hash: None,
                    files: None,
                    body_digest: vec![index + 20; 32],
                    state: None,
                    vault: None,
                    devices: None,
                    approver: None,
                    consume_sessions: None,
                    close_mailbox: None,
                    setup_token_hash: None,
                    clear_repair_reports: None,
                },
                1000,
            )
            .unwrap();
    }
    let notices = start_restored(&options).unwrap();
    assert_eq!(notices.len(), 3);
    assert!(decode_token(TTokenKind::Repair, notices[0].token.as_ref().unwrap()).is_ok());
    assert!(notices[1].token.is_none());
    assert!(notices[1].notice.contains("unfinished move"));
    assert!(notices[2].token.is_none());
    assert!(notices[2].notice.contains("read-only"));
    let restored = storage.vault(&[1; 32]).unwrap().unwrap();
    assert!(!restored.frozen);
    let head = restored.restored.unwrap().restored_head;
    assert!(
        storage
            .state(&[1; 32], TStateKind::MoveSession, &[])
            .unwrap()
            .is_none()
    );
    start_restored(&options).unwrap();
    assert_eq!(
        storage
            .vault(&[1; 32])
            .unwrap()
            .unwrap()
            .restored
            .unwrap()
            .restored_head,
        head
    );
}
