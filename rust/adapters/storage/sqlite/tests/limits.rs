use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::Connection;

#[test]
fn lockout_doubles_to_daily_cap_and_resets_after_success_or_quiet_period() {
    for refund in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
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
    let dir = tempfile::tempdir().unwrap();
    let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
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
fn successful_refund_resets_strikes_before_next_lockout() {
    let dir = tempfile::tempdir().unwrap();
    let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
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

#[test]
fn quiet_period_resets_first_strike() {
    let dir = tempfile::tempdir().unwrap();
    let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
    for _ in 0..5 {
        db.charge(&[1], &TRateBucket::NonMember, 0).unwrap();
    }
    let now = 30 * 86400000;
    for _ in 0..5 {
        db.charge(&[1], &TRateBucket::NonMember, now).unwrap();
    }
    assert_eq!(
        db.charge(&[1], &TRateBucket::NonMember, now).unwrap(),
        TRateCharge::Locked {
            until: now + 900000
        }
    );
}
