use super::fixture::*;
use envden_core::{adapters::*, errors::ErrorCode};
pub fn blob_staging_contract(db: &dyn IStorageAdapter) {
    db.configure_vault(&[1], &vault(), &[], None).unwrap();
    db.put_blob(&[1], &[80], &[81], None, Some(10), Some(1))
        .unwrap();
    assert!(db.has_blob(&[1], &[80]).unwrap());
    assert_eq!(db.vault_usage(&[1]).unwrap(), 1);
    assert_eq!(db.vault_usage(&[2]).unwrap(), 0);
    assert_eq!(
        db.put_blob(&[1], &[82], &[83], None, Some(10), Some(1))
            .unwrap_err()
            .code,
        ErrorCode::StorageQuota
    );
    let policy = IHistoryPolicy {
        max_age: 0,
        min_versions: 1,
    };
    assert_eq!(db.prune(&[1], &policy, 86400010).unwrap().blobs, 0);
    db.put_blob(&[1], &[80], &[81], None, Some(86400010), Some(1))
        .unwrap();
    assert_eq!(db.prune(&[1], &policy, 86400011).unwrap().blobs, 0);
    assert_eq!(db.prune(&[1], &policy, 172800011).unwrap().blobs, 1);
    assert!(!db.has_blob(&[1], &[80]).unwrap());
    assert_eq!(db.vault_usage(&[1]).unwrap(), 0);
}
pub(super) fn staging(f: &IStorageFixture) {
    blob_staging_contract(f.storage.as_ref());
}
pub(super) fn blobs(f: &IStorageFixture) {
    let db = &f.storage;
    db.put_blob(&[1], &[2], &[3], None, None, None).unwrap();
    assert_eq!(db.get_blob(&[1], &[2]).unwrap(), Some(vec![3]));
    assert!(db.get_blob(&[2], &[2]).unwrap().is_none());
    assert!(db.put_blob(&[1], &[2], &[4], None, None, None).is_err());
    assert!(
        db.put_blob(&[1], &[5], &[4], Some(&|_| vec![6]), None, None)
            .unwrap_err()
            .message
            .contains("hash mismatch")
    );
    assert_eq!(db.blob_hashes(&[1]).unwrap(), vec![vec![2]]);
}
pub(super) fn history(f: &IStorageFixture) {
    let db = &f.storage;
    for i in 1..=6 {
        db.put_blob(&[1], &[100 + i], &[i], None, None, None)
            .unwrap();
        let mut update = swap(i);
        update.files = Some(IStoredFiles {
            hash: vec![50 + i],
            bytes: vec![i],
            retain_forever: Some(i == 4),
            versions: vec![IFileVersion {
                file_id: vec![1],
                version: i as u64,
                tombstone: i == 2,
                blob_hash: if i == 2 { None } else { Some(vec![100 + i]) },
            }],
        });
        let previous = [i - 1];
        db.commit_swap(
            &[1],
            if i == 1 { None } else { Some(&previous) },
            &update,
            i as u64,
        )
        .unwrap();
    }
    assert_eq!(
        db.prune(
            &[1],
            &IHistoryPolicy {
                max_age: 1,
                min_versions: 1
            },
            7
        )
        .unwrap(),
        IPruneResult { lists: 3, blobs: 4 }
    );
    for i in [1, 2, 5] {
        assert!(db.file_list(&[1], &[50 + i]).unwrap().is_none());
    }
    for i in [3, 4, 6] {
        assert!(db.file_list(&[1], &[50 + i]).unwrap().is_some());
    }
    assert_eq!(db.get_blob(&[1], &[106]).unwrap(), Some(vec![6]));
    assert_eq!(db.headers(&[1], 1, 6, None, None).unwrap().len(), 6);
}
