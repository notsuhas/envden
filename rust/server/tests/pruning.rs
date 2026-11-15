mod fixture;
use envden_core::{
    adapters::storage::IPruneResult,
    errors::{EnvdenError, ErrorCode},
};
use envden_server::lifecycle::prune_history_safely;
use envden_testing::storage::IFakeStorageAdapter;
use std::sync::{Arc, Mutex};

#[test]
fn pruning_catches_failures_without_logging_exception_contents() {
    let (_directory, mut options) = fixture::fixture();
    options.storage = Arc::new(IFakeStorageAdapter {
        vault_ids: Some(Box::new(|| {
            Err(EnvdenError::new(ErrorCode::Internal, "private detail"))
        })),
        prune: Some(Box::new(|_, _, _| Ok(IPruneResult { lists: 0, blobs: 0 }))),
        ..Default::default()
    });
    assert!(!prune_history_safely(&options));
}

#[test]
fn pruning_continues_past_a_failing_vault() {
    let (_directory, mut options) = fixture::fixture();
    let pruned = Arc::new(Mutex::new(vec![]));
    let captured = pruned.clone();
    options.storage = Arc::new(IFakeStorageAdapter {
        vault_ids: Some(Box::new(|| Ok(vec![vec![1; 32], vec![2; 32]]))),
        prune: Some(Box::new(move |vault, policy, now| {
            assert_eq!(now, 1000000);
            assert_eq!(policy.max_age, 90 * 86400000);
            assert_eq!(policy.min_versions, 20);
            if vault[0] == 1 {
                return Err(EnvdenError::new(ErrorCode::Internal, "private detail"));
            }
            captured.lock().unwrap().push(vault[0]);
            Ok(IPruneResult { lists: 0, blobs: 0 })
        })),
        ..Default::default()
    });
    assert!(!prune_history_safely(&options));
    assert_eq!(*pruned.lock().unwrap(), [0, 2]);
}
