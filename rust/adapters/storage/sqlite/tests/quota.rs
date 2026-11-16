mod support;
#[path = "support/swap.rs"]
mod swap;
use envden_core::{adapters::*, errors::ErrorCode};
use rusqlite::Connection;

#[test]
fn swap_quota_rolls_back_creation_and_head() {
    let (dir, db) = support::setup();
    db.put_blob(&[1], &[2], &[3], None, None, None).unwrap();
    let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    inspect
        .execute_batch("UPDATE blob_usage SET size=1073741824")
        .unwrap();
    let mut swap = swap::swap(1);
    swap.header.hash = vec![2];
    swap.header.bytes = vec![2];
    swap.body_digest = vec![2];
    swap.files = Some(IStoredFiles {
        hash: vec![2],
        bytes: vec![2],
        versions: vec![],
        retain_forever: None,
    });
    assert_eq!(
        db.commit_swap(&[1], None, &swap, 0).unwrap_err().code,
        ErrorCode::StorageQuota
    );
    assert!(!db.has_vault(&[1]).unwrap());
    assert!(db.head(&[1]).unwrap().is_none());
}
#[test]
fn over_quota_metadata_operations_and_imports_match_reference() {
    for operation in ["remove", "rotate", "files", "blob", "move", "repair"] {
        let (dir, db) = support::setup();
        let mut vault = support::vault(true);
        db.configure_vault(&[1], &vault, &[], None).unwrap();
        db.put_blob(&[1], &[2], &[2], None, None, None).unwrap();
        let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
        inspect
            .execute_batch("UPDATE blob_usage SET size=1073741825")
            .unwrap();
        let imported = operation == "move" || operation == "repair";
        if imported {
            vault.active = operation != "move";
            if operation == "repair" {
                vault.restored = Some(IRestoredVault {
                    repair_token_hash: vec![2],
                    restored_head: vec![2],
                    finish_progress: None,
                });
            }
            db.configure_vault(&[1], &vault, &[], None).unwrap();
        }
        let mut swap = swap::swap(1);
        swap.vault = None;
        swap.header.hash = vec![2];
        swap.header.bytes = vec![2];
        swap.body_digest = vec![2];
        if operation == "files" || imported {
            swap.files = Some(IStoredFiles {
                hash: vec![2],
                bytes: vec![2],
                versions: vec![],
                retain_forever: None,
            });
        }
        if operation == "rotate" {
            swap.state = Some(vec![IStateWrite {
                kind: TStateKind::Keyring,
                key: vec![2],
                bytes: Some(vec![2]),
            }]);
        }
        if operation == "remove" {
            swap.devices = Some(vec![IDeviceWrite {
                id: vec![2],
                state: IStoredDevice {
                    client_version: "1.0.0".into(),
                    ..Default::default()
                },
            }]);
        }
        if operation == "blob" {
            assert_eq!(
                db.put_blob(&[1], &[3], &[2], None, None, None)
                    .unwrap_err()
                    .code,
                ErrorCode::StorageQuota
            );
        } else if operation == "files" {
            assert_eq!(
                db.commit_swap(&[1], None, &swap, 0).unwrap_err().code,
                ErrorCode::StorageQuota
            );
        } else {
            assert_eq!(
                db.commit_swap(&[1], None, &swap, 0).unwrap(),
                TCommitResult::Committed
            );
            if imported {
                db.put_file_list(
                    &[1],
                    &IStoredFiles {
                        hash: vec![4],
                        bytes: vec![2],
                        versions: vec![],
                        retain_forever: None,
                    },
                    0,
                )
                .unwrap();
                db.put_blob(&[1], &[5], &[2], None, None, None).unwrap();
            }
            assert_eq!(db.head(&[1]).unwrap(), Some(vec![2]));
        }
        db.put_blob(&[1], &[2], &[2], None, None, None).unwrap();
    }
}

#[test]
fn preserves_reference_keyring_quota_check_order() {
    let (dir, db) = support::setup();
    db.configure_vault(&[1], &support::vault(true), &[], None)
        .unwrap();
    db.put_blob(&[1], &[2], &[2], None, None, None).unwrap();
    let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    inspect
        .execute_batch("UPDATE blob_usage SET size=1073741824")
        .unwrap();
    let mut swap = swap::swap(1);
    swap.vault = None;
    swap.state = Some(vec![IStateWrite {
        kind: TStateKind::Keyring,
        key: vec![2],
        bytes: Some(vec![2]),
    }]);
    assert_eq!(
        db.commit_swap(&[1], None, &swap, 0).unwrap(),
        TCommitResult::Committed
    );
    assert_eq!(db.vault_usage(&[1]).unwrap(), VAULT_QUOTA_BYTES + 1);
}
