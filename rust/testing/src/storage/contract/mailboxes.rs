use super::fixture::*;
use envden_core::adapters::*;
pub(super) fn slots(f: &IStorageFixture) {
    let db = &f.storage;
    assert_eq!(db.open_mailbox(&[1], &[2], 0).unwrap().unwrap().number, 1);
    assert_eq!(db.open_mailbox(&[2], &[2], 0).unwrap().unwrap().number, 2);
    for (slot, bytes, expected) in [
        (TMailboxSlot::PairJoiner, 2, TMailboxWrite::OutOfOrder),
        (TMailboxSlot::KE1, 2, TMailboxWrite::Written),
        (TMailboxSlot::KE1, 2, TMailboxWrite::Identical),
        (TMailboxSlot::KE1, 3, TMailboxWrite::Closed),
    ] {
        assert_eq!(
            db.write_mailbox(&[1], 1, slot, &[bytes], 1).unwrap(),
            expected
        );
    }
    assert_eq!(db.open_mailbox(&[1], &[2], 1).unwrap().unwrap().number, 1);
    assert!(db.mailbox(&[1], 1, 600001).unwrap().is_none());
}
pub(super) fn openings(f: &IStorageFixture) {
    let db = &f.storage;
    for i in 0..10 {
        if let Some(b) = db.open_mailbox(&[1], &[2], i).unwrap() {
            db.close_mailbox(&[1], b.number).unwrap();
        }
    }
    assert!(db.open_mailbox(&[1], &[2], 100).unwrap().is_none());
    assert_eq!(
        db.open_mailbox(&[1], &[2], 3600000)
            .unwrap()
            .unwrap()
            .number,
        1
    );
}
pub(super) fn pairing(f: &IStorageFixture) {
    let db = &f.storage;
    db.open_mailbox(&[1], &[2], 0).unwrap();
    let mut update = swap(1);
    update.close_mailbox = Some(1);
    update.approver = Some(IApproverWrite {
        device: vec![3],
        bytes: vec![9],
    });
    db.commit_swap(&[1], None, &update, 1).unwrap();
    assert!(db.mailbox(&[1], 1, 2).unwrap().is_none());
    assert_eq!(db.approver(&[1], &[3], 86400000).unwrap(), Some(vec![9]));
    assert!(db.approver(&[1], &[3], 86400001).unwrap().is_none());
}
