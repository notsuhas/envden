mod support;
use envden_protocol::{chain::*, protocol::*};
use support::*;

#[test]
fn genesis_first_epoch_and_device_addition_require_valid_context() {
    let (state, genesis, _) = fixture();
    assert_eq!(
        header(&state, &IFiles { entries: vec![] }).body.list_head,
        state.head
    );
    let (a, key) = device(1);
    let (b, _) = device(2);
    let add = |device: IDeviceRecord, recipient| {
        TEntryPayload::AddDevice(IAddDevice {
            device,
            wrap: IWrap {
                recipient,
                enc: [1; 32],
                ct: vec![2; 48],
            },
        })
    };
    let initial = apply(None, &genesis).unwrap();
    for change in [
        add(b.clone(), b.id),
        TEntryPayload::ServerMoved(IServerMoved {
            old_pin: initial.server_pin,
            new_pin: [20; 32],
            new_address: "new.example".into(),
        }),
        TEntryPayload::NewEpoch(INewEpoch {
            change: IEpochChange {
                epoch: 2,
                ..change(&initial)
            },
        }),
    ] {
        assert!(matches!(
            apply_entry(Some(&initial), &entry(&initial, change, &a, &key)).unwrap(),
            TDeviceListResult::Invalid
        ));
    }
    let mut damaged = genesis.clone();
    damaged.signature.fill(0);
    assert!(matches!(
        apply_entry(None, &damaged).unwrap(),
        TDeviceListResult::Invalid
    ));
    damaged.body.vault_id = [2; 32];
    damaged = sign_object(damaged.body, &key, "entry").unwrap();
    assert!(matches!(
        apply_entry(None, &damaged).unwrap(),
        TDeviceListResult::Invalid
    ));
    for payload in [
        add(
            IDeviceRecord {
                name: a.name.clone(),
                ..b.clone()
            },
            b.id,
        ),
        add(b.clone(), a.id),
    ] {
        assert!(matches!(
            apply_entry(Some(&state), &entry(&state, payload, &a, &key)).unwrap(),
            TDeviceListResult::Invalid
        ));
    }
    let mut full = state.clone();
    full.devices.extend((0..63).map(|i| ([i; 16], a.clone())));
    assert_eq!(full.devices.len(), 64);
    assert!(matches!(
        apply_entry(Some(&full), &entry(&full, add(b.clone(), b.id), &a, &key)).unwrap(),
        TDeviceListResult::Invalid
    ));
    let added = apply(Some(&state), &entry(&state, add(b.clone(), b.id), &a, &key)).unwrap();
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
            &a,
            &key,
        ),
    )
    .unwrap();
    let (_, bkey) = device(2);
    assert!(matches!(
        apply_entry(
            Some(&removed),
            &entry(
                &removed,
                TEntryPayload::NewEpoch(INewEpoch {
                    change: change(&removed)
                }),
                &b,
                &bkey
            )
        )
        .unwrap(),
        TDeviceListResult::Invalid
    ));
}
