use super::*;

#[test]
fn genesis_epoch_and_entry_bindings() {
    let (s, g, e) = fixture();
    assert!(matches!(
        verify_chain(&[g.clone(), e]).unwrap(),
        TDeviceListResult::Valid { .. }
    ));
    assert!(matches!(
        verify_chain(&[]).unwrap(),
        TDeviceListResult::Invalid
    ));
    assert!(apply(Some(&s), &g).is_err());
    let (d, key) = device(1);
    for n in 0..5 {
        let mut e = entry(
            &s,
            TEntryPayload::NewEpoch(INewEpoch { change: change(&s) }),
            &d,
            &key,
        );
        match n {
            0 => e.body.vault_id = [0; 32],
            1 => e.body.parent = [0; 32],
            2 => e.body.seq += 1,
            3 => e.body.signer = [0; 16],
            _ => e.signature.fill(0),
        }
        if n < 4 {
            e = sign_object(e.body, &key, "entry").unwrap();
        }
        assert!(matches!(
            apply_entry(Some(&s), &e).unwrap(),
            TDeviceListResult::Invalid
        ));
    }
}
#[test]
fn additions_removal_and_reuse() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    let (b, _) = device(2);
    let add = TEntryPayload::AddDevice(IAddDevice {
        device: b.clone(),
        wrap: IWrap {
            recipient: b.id,
            enc: [1; 32],
            ct: vec![2; 48],
        },
    });
    let added = apply(Some(&s), &entry(&s, add.clone(), &d, &key)).unwrap();
    assert_eq!(s.devices.len(), 1);
    assert_eq!(added.devices.len(), 2);
    assert!(apply(Some(&added), &entry(&added, add.clone(), &d, &key)).is_err());
    let mut c = change(&added);
    c.wraps.retain(|w| w.recipient != b.id);
    let removed = apply(
        Some(&added),
        &entry(
            &added,
            TEntryPayload::RemoveDevice(IRemoveDevice {
                device: b.id,
                new_recovery: None,
                change: c,
            }),
            &d,
            &key,
        ),
    )
    .unwrap();
    assert!(apply(Some(&removed), &entry(&removed, add, &d, &key)).is_err());
    for target in [d.id, b.id, s.recovery.id] {
        assert!(
            apply(
                Some(&s),
                &entry(
                    &s,
                    TEntryPayload::RemoveDevice(IRemoveDevice {
                        device: target,
                        new_recovery: None,
                        change: change(&s)
                    }),
                    &d,
                    &key
                )
            )
            .is_err()
        );
    }
}
#[test]
fn epochs_reject_wrong_recipients_and_numbers() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    for n in 0..4 {
        let mut c = change(&s);
        match n {
            0 => c.epoch += 1,
            1 => {
                c.wraps.pop();
            }
            2 => c.wraps.push(IWrap {
                recipient: [255; 16],
                enc: [0; 32],
                ct: vec![0; 48],
            }),
            _ => c.wraps.push(c.wraps[0].clone()),
        }
        c.wraps.sort_by_key(|w| w.recipient);
        let e = TEntry {
            vault_id: s.vault_id,
            seq: s.seq + 1,
            parent: s.head,
            change: TEntryPayload::NewEpoch(INewEpoch { change: c }),
            signer: d.id,
        };
        let signature = encode(&e)
            .map(|bytes| sign(&key, "entry", &bytes).to_vec())
            .unwrap_or_else(|_| vec![0; 64]);
        let signed = ISigned { body: e, signature };
        assert!(apply(Some(&s), &signed).is_err());
    }
    let initial = apply(None, &fixture().1).unwrap();
    assert!(
        apply(
            Some(&initial),
            &entry(
                &initial,
                TEntryPayload::RenameDevice(IRenameDevice {
                    device: d.id,
                    name: "laptop".into()
                }),
                &d,
                &key
            )
        )
        .is_err()
    );
}
