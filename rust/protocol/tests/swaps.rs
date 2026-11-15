mod support;
#[path = "support/swaps.rs"]
mod swap_support;
use envden_protocol::{chain::*, protocol::*};
use swap_support::swap_fixture;
#[test]
fn every_operation_accepts_exact_payload_and_rejects_absent_or_extra_fields() {
    for op in 1..=13 {
        let (s, c) = swap_fixture(op);
        let result = validate_swap(&s, &c).unwrap();
        let TSwapResult::Valid { authorization, .. } = result else {
            panic!("valid op {op} rejected")
        };
        let expected = match op {
            1 | 13 => TAuthorization::Unlocked,
            2 => TAuthorization::MailboxGrant,
            3 => TAuthorization::JoinTicket,
            4 => TAuthorization::FreshOrRepairToken,
            5..=8 => TAuthorization::Fresh,
            9 => TAuthorization::SkProof,
            10 => TAuthorization::MoveSession,
            _ => TAuthorization::RepairToken,
        };
        assert_eq!(authorization, expected);
        for field in 0..6 {
            let mut v = s.clone();
            match field {
                0 => {
                    v.files = if v.files.is_some() {
                        None
                    } else {
                        Some(IFiles { entries: vec![] })
                    }
                }
                1 => {
                    v.keyring = if v.keyring.is_some() {
                        None
                    } else {
                        Some(vec![0])
                    }
                }
                2 => {
                    v.envelope = if v.envelope.is_some() {
                        None
                    } else {
                        Some(vec![0])
                    }
                }
                3 => {
                    v.sk_pub = if v.sk_pub.is_some() {
                        None
                    } else {
                        Some([0; 32])
                    }
                }
                4 => {
                    v.opaque_record = if v.opaque_record.is_some() {
                        None
                    } else {
                        Some(vec![0; 192])
                    }
                }
                _ => {
                    v.approver = if v.approver.is_some() {
                        None
                    } else {
                        Some(vec![0])
                    }
                }
            }
            assert!(
                matches!(validate_swap(&v, &c).unwrap(), TSwapResult::Invalid),
                "op {op},field {field}"
            );
        }
        let mut v = s.clone();
        v.header.signature.fill(0);
        assert!(matches!(
            validate_swap(&v, &c).unwrap(),
            TSwapResult::Invalid
        ));
    }
}
#[test]
fn move_destination_and_repair_registration_bindings() {
    let (s, mut c) = swap_fixture(10);
    c.destination_pin = Some([15; 32]);
    assert!(matches!(
        validate_swap(&s, &c).unwrap(),
        TSwapResult::Valid {
            authorization: TAuthorization::MoveImport,
            ..
        }
    ));
    c.destination_pin = Some([0; 32]);
    assert!(matches!(
        validate_swap(&s, &c).unwrap(),
        TSwapResult::Invalid
    ));
    let (mut s, mut c) = swap_fixture(12);
    c.repair_registration_required = true;
    assert!(matches!(
        validate_swap(&s, &c).unwrap(),
        TSwapResult::Invalid
    ));
    s.opaque_record = Some(vec![0; 192]);
    assert!(matches!(
        validate_swap(&s, &c).unwrap(),
        TSwapResult::Valid { .. }
    ));
    s.opaque_record = Some(vec![0; 191]);
    assert!(matches!(
        validate_swap(&s, &c).unwrap(),
        TSwapResult::Invalid
    ));
}
