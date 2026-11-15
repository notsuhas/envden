use super::fixture::*;
use envden_core::adapters::*;
pub(super) fn creation(f: &IStorageFixture) {
    let db = &f.storage;
    db.set_setup_token(&[90]).unwrap();
    let mut first = swap(1);
    first.setup_token_hash = Some(vec![90]);
    assert_eq!(
        db.commit_swap(&[1], None, &first, 0).unwrap(),
        TCommitResult::Committed
    );
    assert!(db.setup_token().unwrap().is_none());
    assert!(db.find_committed(&[1], &first.body_digest).unwrap());
    assert!(!db.find_committed(&[1], &[100]).unwrap());
    assert_eq!(db.vault_ids().unwrap(), vec![vec![1]]);
    assert_eq!(
        db.commit_swap(&[1], None, &first, 1).unwrap(),
        TCommitResult::RetryOfCommitted
    );
    assert!(matches!(
        db.commit_swap(&[1], None, &swap(2), 1).unwrap(),
        TCommitResult::HeadMoved { .. }
    ));
}
pub(super) fn discard(f: &IStorageFixture) {
    let db = &f.storage;
    let key = ISessionKey {
        kind: TSessionKind::Login,
        device: vec![2],
        purpose: "registration".into(),
    };
    let mut first = swap(1);
    first.vault.as_mut().unwrap().active = false;
    first.state = Some(vec![IStateWrite {
        kind: TStateKind::MoveSession,
        key: vec![0],
        bytes: Some(vec![4]),
    }]);
    db.commit_swap(&[1], None, &first, 0).unwrap();
    db.put_session(&[1], &key, &[5], 0).unwrap();
    db.put_device(
        &[1],
        &[2],
        &IStoredDevice {
            client_version: "1.0.0".into(),
            ..Default::default()
        },
    )
    .unwrap();
    db.discard_inactive_vault(&[1]).unwrap();
    assert!(!db.has_vault(&[1]).unwrap());
    assert!(db.head(&[1]).unwrap().is_none());
    assert!(
        db.state(&[1], TStateKind::MoveSession, &[0])
            .unwrap()
            .is_none()
    );
    assert!(db.session(&[1], &key, 0).unwrap().is_none());
    assert!(db.device(&[1], &[2]).unwrap().is_none());
    assert_eq!(
        db.commit_swap(&[1], None, &swap(1), 0).unwrap(),
        TCommitResult::Committed
    );
    assert_eq!(
        db.discard_inactive_vault(&[1]).unwrap_err().message,
        "Cannot discard an active vault"
    );
}
pub(super) fn persistence(f: &IStorageFixture) {
    let db = &f.storage;
    let mut first = swap(1);
    first.entries = vec![IStoredHeader {
        seq: 0,
        hash: vec![40],
        bytes: vec![41],
    }];
    first.files = Some(IStoredFiles {
        hash: vec![50],
        bytes: vec![51],
        versions: vec![],
        retain_forever: None,
    });
    first.state = Some(
        [
            TStateKind::Keyring,
            TStateKind::Envelope,
            TStateKind::SkPub,
            TStateKind::OpaqueRecord,
        ]
        .into_iter()
        .map(|kind| IStateWrite {
            kind,
            key: vec![0],
            bytes: Some(vec![60]),
        })
        .collect(),
    );
    first.devices = Some(vec![IDeviceWrite {
        id: vec![3],
        state: IStoredDevice {
            unlocked_until: 100,
            fresh_until: 50,
            client_version: "1.0.0".into(),
            mailbox_grant: None,
        },
    }]);
    db.commit_swap(&[1], None, &first, 0).unwrap();
    let next = (f.reopen)();
    assert_eq!(next.head(&[1]).unwrap(), Some(vec![1]));
    assert_eq!(
        next.headers(&[1], 0, 2, None, None).unwrap(),
        vec![first.header.clone()]
    );
    assert!(next.headers(&[1], 0, 2, Some(0), None).unwrap().is_empty());
    next.cap_unlocks(&[1], 70).unwrap();
    assert_eq!(next.device(&[1], &[3]).unwrap().unwrap().unlocked_until, 70);
    next.cap_unlocks(&[1], 90).unwrap();
    assert_eq!(next.device(&[1], &[3]).unwrap().unwrap().unlocked_until, 70);
    assert_eq!(next.header(&[1], &[1]).unwrap(), Some(first.header));
    assert_eq!(next.entries(&[1], 0, 1, None, None).unwrap(), first.entries);
    assert_eq!(next.file_list(&[1], &[50]).unwrap(), Some(vec![51]));
    assert_eq!(
        next.state(&[1], TStateKind::OpaqueRecord, &[0]).unwrap(),
        Some(vec![60])
    );
    assert!(next.head(&[2]).unwrap().is_none());
}
pub(super) fn rollback(f: &IStorageFixture) {
    let db = &f.storage;
    db.configure_vault(&[1], &vault(), &[], None).unwrap();
    let key = ISessionKey {
        kind: TSessionKind::Login,
        device: vec![2],
        purpose: "finish".into(),
    };
    db.put_session(&[1], &key, &[9], 0).unwrap();
    db.commit_swap(&[1], None, &swap(1), 0).unwrap();
    let mut invalid = swap(2);
    invalid.header = swap(1).header;
    invalid.consume_sessions = Some(vec![key.clone()]);
    invalid.vault.as_mut().unwrap().frozen = true;
    assert!(db.commit_swap(&[1], Some(&[1]), &invalid, 1).is_err());
    assert_eq!(db.session(&[1], &key, 1).unwrap(), Some(vec![9]));
    assert!(!db.vault(&[1]).unwrap().unwrap().frozen);
    assert!(
        db.state(&[1], TStateKind::OpaqueRecord, &[0])
            .unwrap()
            .is_none()
    );
    assert_eq!(db.head(&[1]).unwrap(), Some(vec![1]));
}
