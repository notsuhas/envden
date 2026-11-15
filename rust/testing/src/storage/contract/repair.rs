use super::fixture::*;
use envden_core::adapters::*;
pub(super) fn repair(f: &IStorageFixture) {
    let db = &f.storage;
    db.set_setup_token(&[8]).unwrap();
    let state = IStoredVault {
        active: false,
        frozen: true,
        server_moved: Some(vec![7]),
        sk_refused: true,
        restored: Some(IRestoredVault {
            repair_token_hash: vec![6],
            restored_head: vec![5],
            finish_progress: Some(vec![4]),
        }),
        unlock_period: None,
    };
    db.configure_vault(
        &[1],
        &state,
        &[
            IStateWrite {
                kind: TStateKind::MoveSession,
                key: vec![1],
                bytes: Some(vec![3]),
            },
            IStateWrite {
                kind: TStateKind::RepairReport,
                key: vec![2],
                bytes: Some(vec![2]),
            },
        ],
        Some(&[8]),
    )
    .unwrap();
    let next = (f.reopen)();
    assert_eq!(
        next.vault(&[1])
            .unwrap()
            .unwrap()
            .restored
            .unwrap()
            .finish_progress,
        Some(vec![4])
    );
    assert_eq!(next.states(&[1], TStateKind::MoveSession).unwrap().len(), 1);
    let mut update = swap(1);
    update.clear_repair_reports = Some(true);
    next.commit_swap(&[1], None, &update, 0).unwrap();
    assert!(next.vault(&[1]).unwrap().unwrap().restored.is_none());
    assert!(
        next.states(&[1], TStateKind::RepairReport)
            .unwrap()
            .is_empty()
    );
}
