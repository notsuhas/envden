use super::fixture::*;
use envden_core::adapters::*;
pub(super) fn sessions(f: &IStorageFixture) {
    let db = &f.storage;
    let mut key = ISessionKey {
        kind: TSessionKind::Login,
        device: vec![1],
        purpose: "unlock".into(),
    };
    db.put_session(&[1], &key, &[9], 100).unwrap();
    key.purpose = "kit".into();
    assert!(db.session(&[1], &key, 101).unwrap().is_none());
    key.purpose = "unlock".into();
    assert!(db.session(&[2], &key, 101).unwrap().is_none());
    assert!(db.consume_session(&[1], &key, 120100).unwrap().is_none());
    db.put_session(&[1], &key, &[9], 200).unwrap();
    assert_eq!(db.consume_session(&[1], &key, 201).unwrap(), Some(vec![9]));
    assert!(db.consume_session(&[1], &key, 201).unwrap().is_none());
}
pub(super) fn tickets(f: &IStorageFixture) {
    let db = &f.storage;
    let key = ISessionKey {
        kind: TSessionKind::JoinTicket,
        device: vec![1],
        purpose: "join".into(),
    };
    db.put_session(&[1], &key, &[9], 0).unwrap();
    assert_eq!(db.session(&[1], &key, 599999).unwrap(), Some(vec![9]));
    assert!(db.session(&[1], &key, 600000).unwrap().is_none());
    db.put_session(&[1], &key, &[9], 0).unwrap();
    let mut update = swap(1);
    update.consume_sessions = Some(vec![key.clone()]);
    db.commit_swap(&[1], None, &update, 1).unwrap();
    assert!(db.session(&[1], &key, 2).unwrap().is_none());
}
pub(super) fn nonces(f: &IStorageFixture) {
    let db = &f.storage;
    assert!(db.remember_nonce(&[1], &[2], 0).unwrap());
    assert!(!db.remember_nonce(&[1], &[2], 1).unwrap());
    assert!(db.remember_nonce(&[2], &[2], 1).unwrap());
    assert!(db.remember_nonce(&[1], &[2], 600000).unwrap());
}
pub(super) fn rates(f: &IStorageFixture) {
    let db = &f.storage;
    let bucket = TRateBucket::NonMember;
    for _ in 0..5 {
        assert!(matches!(
            db.charge(&[1], &bucket, 0).unwrap(),
            TRateCharge::Charged { .. }
        ));
    }
    assert_eq!(
        db.charge(&[1], &bucket, 1).unwrap(),
        TRateCharge::Locked { until: 900000 }
    );
    assert!(matches!(
        db.charge(&[2], &bucket, 1).unwrap(),
        TRateCharge::Charged { .. }
    ));
    for _ in 0..5 {
        db.charge(&[1], &bucket, 900000).unwrap();
    }
    assert_eq!(
        db.charge(&[1], &bucket, 900001).unwrap(),
        TRateCharge::Locked { until: 2700000 }
    );
    let TRateCharge::Charged { receipt } = db
        .charge(&[1], &TRateBucket::Member { device: vec![4] }, 0)
        .unwrap()
    else {
        panic!("Expected charge")
    };
    assert!(db.refund(&receipt, 1).unwrap());
    assert!(!db.refund(&receipt, 1).unwrap());

    let bucket = TRateBucket::NonMember;
    let receipts: Vec<_> = (0..5)
        .map(|_| match db.charge(&[3], &bucket, 0).unwrap() {
            TRateCharge::Charged { receipt } => receipt,
            locked => panic!("Expected charge, got {locked:?}"),
        })
        .collect();
    for _ in 0..5 {
        db.charge(&[3], &bucket, 900000).unwrap();
    }
    assert!(!db.refund(&receipts[0], 900000).unwrap());
    let TRateCharge::Charged { receipt } = db.charge(&[3], &bucket, 2700000).unwrap() else {
        panic!("Expected charge")
    };
    assert!(db.refund(&receipt, 2700000).unwrap());
    for _ in 0..5 {
        db.charge(&[3], &bucket, 2700001).unwrap();
    }
    assert_eq!(
        db.charge(&[3], &bucket, 2700002).unwrap(),
        TRateCharge::Locked { until: 3600001 },
        "a refund resets strikes"
    );
}
