mod support;
use envden_protocol::{chain::*, protocol::*};
use std::collections::BTreeSet;
use support::*;

#[test]
fn swap_roundtrip_and_rename_authorization() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    let files = IFiles { entries: vec![] };
    let previous = header(&s, &files);
    let e = entry(
        &s,
        TEntryPayload::RenameDevice(IRenameDevice {
            device: d.id,
            name: "laptop".into(),
        }),
        &d,
        &key,
    );
    let next = apply(Some(&s), &e).unwrap();
    let expected = object_hash(&previous, "manifest").unwrap();
    let mut h = previous.body.clone();
    h.seq += 1;
    h.prev = expected;
    h.op = 13;
    h.list_head = next.head;
    h.list_seq = next.seq;
    let mut swap = ISwap {
        expected_head: expected,
        entries: vec![e],
        header: sign_object(h, &key, "manifest").unwrap(),
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    };
    assert_eq!(decode::<ISwap>(&encode(&swap).unwrap()).unwrap(), swap);
    let c = ISwapContext {
        previous,
        state: s,
        files,
        request_signer: d.id,
        missing_blobs: BTreeSet::new(),
        destination_pin: None,
        ancestor_header_hashes: BTreeSet::new(),
        repair_registration_required: false,
    };
    assert!(matches!(
        validate_swap(&swap, &c).unwrap(),
        TSwapResult::Valid {
            authorization: TAuthorization::Unlocked,
            ..
        }
    ));
    swap.approver = Some(vec![1]);
    assert!(matches!(
        validate_swap(&swap, &c).unwrap(),
        TSwapResult::Invalid
    ));
    swap.approver = None;
    swap.expected_head = [0; 32];
    assert!(matches!(
        validate_swap(&swap, &c).unwrap(),
        TSwapResult::Invalid
    ));
}
#[test]
fn operation_matrix_constraints() {
    let (s, _, _) = fixture();
    let files = IFiles { entries: vec![] };
    let previous = header(&s, &files).body;
    for op in [1, 8, 11] {
        let mut h = previous.clone();
        h.op = op;
        if op == 8 {
            h.envelope_hash = [11; 32];
        } else {
            h.files_hash = [12; 32];
        }
        assert!(operation_requirement(&previous, &h, &[], &s, false).is_ok());
        h.epoch += 1;
        assert!(operation_requirement(&previous, &h, &[], &s, false).is_err());
    }
    for op in [0, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14] {
        let mut h = previous.clone();
        h.op = op;
        assert!(operation_requirement(&previous, &h, &[], &s, false).is_err());
    }
}
