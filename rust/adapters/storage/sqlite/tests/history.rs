mod support;
#[path = "support/swap.rs"]
mod swap;
use envden_core::adapters::*;

fn files(i: u8, versions: Vec<IFileVersion>) -> IStoredFiles {
    IStoredFiles {
        hash: vec![i],
        bytes: vec![i],
        versions,
        retain_forever: None,
    }
}
fn live(file: u8, version: u64, blob: u8) -> IFileVersion {
    IFileVersion {
        file_id: vec![file],
        version,
        blob_hash: Some(vec![blob]),
        tombstone: false,
    }
}
#[test]
fn unchanged_versions_do_not_pin_every_list() {
    let (dir, db) = support::setup();
    for i in 1..=3 {
        db.put_blob(&[1], &[i], &[i], None, None, None).unwrap();
        let mut swap = swap::swap(i);
        swap.files = Some(files(i, vec![live(1, 1, 1), live(2, i as u64, i)]));
        db.commit_swap(
            &[1],
            (i > 1).then_some(vec![i - 1]).as_deref(),
            &swap,
            i as u64,
        )
        .unwrap();
    }
    let policy = IHistoryPolicy {
        max_age: 0,
        min_versions: 1,
    };
    assert_eq!(
        db.prune(&[1], &policy, 4).unwrap(),
        IPruneResult { lists: 1, blobs: 1 }
    );
    assert!(db.file_list(&[1], &[2]).unwrap().is_none());
    assert!(!dir.path().join("blobs/01/02").exists());
    assert_eq!(db.get_blob(&[1], &[1]).unwrap(), Some(vec![1]));
    assert!(
        db.transaction(&mut || db.prune(&[1], &policy, 4).map(|_| ()))
            .unwrap_err()
            .message
            .contains("outside")
    );
}
#[test]
fn restored_current_list_stays_pinned_after_header_only_import() {
    let (_dir, db) = support::setup();
    let mut swap = swap::swap(1);
    swap.files = Some(files(1, vec![live(1, 1, 1)]));
    db.commit_swap(&[1], None, &swap, 1).unwrap();
    let mut swap = swap::swap(2);
    swap.vault = None;
    swap.files_hash = Some(vec![2]);
    db.commit_swap(&[1], Some(&[1]), &swap, 2).unwrap();
    db.put_file_list(&[1], &files(2, vec![live(1, 2, 2)]), 2)
        .unwrap();
    assert_eq!(
        db.prune(
            &[1],
            &IHistoryPolicy {
                max_age: 0,
                min_versions: 1
            },
            4
        )
        .unwrap()
        .lists,
        1
    );
    assert!(db.file_list(&[1], &[1]).unwrap().is_none());
    assert_eq!(db.file_list(&[1], &[2]).unwrap(), Some(vec![2]));
}
#[test]
fn retained_lists_do_not_retain_other_files_pruned_blobs() {
    let (_dir, db) = support::setup();
    db.put_blob(&[1], &[200], &[200], None, None, None).unwrap();
    for i in 1..=32 {
        let version = if i <= 2 { 1 } else { i - 1 };
        if i != 2 {
            db.put_blob(&[1], &[100 + version], &[100 + version], None, None, None)
                .unwrap();
        }
        let second = if i == 1 {
            live(2, 1, 200)
        } else {
            IFileVersion {
                file_id: vec![2],
                version: 2,
                blob_hash: None,
                tombstone: true,
            }
        };
        let mut swap = swap::swap(i);
        swap.files = Some(files(
            i,
            vec![live(1, version as u64, 100 + version), second],
        ));
        db.commit_swap(
            &[1],
            (i > 1).then_some(vec![i - 1]).as_deref(),
            &swap,
            i as u64,
        )
        .unwrap();
    }
    db.prune(
        &[1],
        &IHistoryPolicy {
            max_age: 0,
            min_versions: 20,
        },
        40,
    )
    .unwrap();
    for blob in [101, 111] {
        assert!(db.get_blob(&[1], &[blob]).unwrap().is_none());
    }
    for blob in [112, 200] {
        assert_eq!(db.get_blob(&[1], &[blob]).unwrap(), Some(vec![blob]));
    }
    assert_eq!(db.file_list(&[1], &[32]).unwrap(), Some(vec![32]));
}
#[test]
fn over_quota_deletions_commit_but_new_content_does_not() {
    let (dir, db) = support::setup();
    for i in 1..=3 {
        db.put_blob(&[1], &[i], &[i], None, None, None).unwrap();
    }
    let mut swap = swap::swap(1);
    swap.header.hash = vec![11];
    swap.header.bytes = vec![11];
    swap.body_digest = vec![11];
    let mut list = files(21, vec![live(1, 1, 1), live(2, 1, 2)]);
    list.bytes = vec![1; 8];
    swap.files = Some(list);
    db.commit_swap(&[1], None, &swap, 0).unwrap();
    let inspect = rusqlite::Connection::open(dir.path().join("envden.sqlite")).unwrap();
    inspect
        .execute_batch("UPDATE blob_usage SET size=1073741825 WHERE hash=x'01'")
        .unwrap();
    let mut swap = swap::swap(2);
    swap.files = Some(files(
        2,
        vec![
            live(1, 1, 1),
            IFileVersion {
                file_id: vec![2],
                version: 2,
                blob_hash: None,
                tombstone: true,
            },
        ],
    ));
    swap.header.hash = vec![12];
    swap.header.bytes = vec![12];
    swap.body_digest = vec![12];
    swap.files.as_mut().unwrap().hash = vec![22];
    swap.files.as_mut().unwrap().bytes = vec![2; 8];
    assert_eq!(
        db.commit_swap(&[1], Some(&[11]), &swap, 0).unwrap(),
        TCommitResult::Committed
    );
    let mut swap = swap::swap(3);
    swap.files = Some(files(3, vec![live(1, 1, 1), live(3, 1, 3)]));
    swap.header.hash = vec![13];
    swap.header.bytes = vec![13];
    swap.body_digest = vec![13];
    swap.files.as_mut().unwrap().hash = vec![23];
    swap.files.as_mut().unwrap().bytes = vec![3; 8];
    assert_eq!(
        db.commit_swap(&[1], Some(&[12]), &swap, 0)
            .unwrap_err()
            .code,
        envden_core::errors::ErrorCode::StorageQuota
    );
}
