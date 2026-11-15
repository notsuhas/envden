mod support;
#[path = "support/swap.rs"]
mod swap;
use envden_core::{adapters::*, errors::ErrorCode};
use rusqlite::Connection;

#[test]
fn lockout_doubles_to_daily_cap_and_resets_after_success_or_quiet_period() {
    for refund in [false, true] {
        let (_dir, db) = support::setup();
        let bucket = TRateBucket::NonMember;
        let mut now = 0;
        for strike in 0..10 {
            let mut receipt = String::new();
            for _ in 0..5 {
                let TRateCharge::Charged { receipt: r } = db.charge(&[1], &bucket, now).unwrap()
                else {
                    panic!()
                };
                receipt = r;
            }
            let duration = (900000 * 2_u64.pow(strike)).min(86400000);
            assert_eq!(
                db.charge(&[1], &bucket, now + 1).unwrap(),
                TRateCharge::Locked {
                    until: now + duration
                }
            );
            if strike == 9 && refund {
                assert!(db.refund(&receipt, now + 1).unwrap());
            }
            now += duration;
        }
        now += 30 * 86400000;
        for _ in 0..5 {
            assert!(matches!(
                db.charge(&[1], &bucket, now).unwrap(),
                TRateCharge::Charged { .. }
            ));
        }
        assert_eq!(
            db.charge(&[1], &bucket, now).unwrap(),
            TRateCharge::Locked {
                until: now + 900000
            }
        );
    }
}
#[test]
fn expired_charges_and_strikes_are_pruned_across_buckets() {
    let (dir, db) = support::setup();
    for i in 0..100 {
        for _ in 0..20 {
            db.charge(
                &[i],
                &TRateBucket::Mailbox {
                    device: Some(vec![i]),
                },
                0,
            )
            .unwrap();
        }
    }
    db.charge(
        &[255],
        &TRateBucket::Mailbox { device: None },
        30 * 86400000,
    )
    .unwrap();
    let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    for (table, expected) in [("charges", 1), ("buckets", 0)] {
        assert_eq!(
            inspect
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            expected
        );
    }
}
#[test]
fn swap_quota_rolls_back_creation_and_head() {
    let (dir, db) = support::setup();
    db.put_blob(&[1], &[2], &[3], None, None, None).unwrap();
    let inspect = Connection::open(dir.path().join("envden.sqlite")).unwrap();
    inspect
        .execute_batch("UPDATE blob_usage SET size=1073741824")
        .unwrap();
    let mut swap = swap::swap(1);
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
                state: IStoredDevice::default(),
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

#[test]
fn successful_refund_resets_strikes_before_next_lockout() {
    let (_dir, db) = support::setup();
    let mut receipt = String::new();
    for _ in 0..5 {
        let TRateCharge::Charged { receipt: value } =
            db.charge(&[1], &TRateBucket::NonMember, 0).unwrap()
        else {
            panic!()
        };
        receipt = value;
    }
    assert!(db.refund(&receipt, 1).unwrap());
    for _ in 0..5 {
        db.charge(&[1], &TRateBucket::NonMember, 900001).unwrap();
    }
    assert_eq!(
        db.charge(&[1], &TRateBucket::NonMember, 900001).unwrap(),
        TRateCharge::Locked { until: 1800001 }
    );
}
