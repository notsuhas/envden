use super::*;

#[test]
fn rename_is_self_only_and_unique() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    let e = entry(
        &s,
        TEntryPayload::RenameDevice(IRenameDevice {
            device: d.id,
            name: "laptop".into(),
        }),
        &d,
        &key,
    );
    let renamed = apply(Some(&s), &e).unwrap();
    assert_eq!(renamed.devices[&d.id].name, "laptop");
    assert_eq!(renamed.epoch, s.epoch);
    assert_eq!(renamed.commits, s.commits);
    for (target, name) in [
        (d.id, d.name.clone()),
        ([0; 16], "laptop".into()),
        (d.id, "".into()),
        (d.id, "a".repeat(65)),
        (d.id, "laptop\u{200b}".into()),
    ] {
        let e = ISigned {
            body: TEntry {
                vault_id: s.vault_id,
                seq: s.seq + 1,
                parent: s.head,
                change: TEntryPayload::RenameDevice(IRenameDevice {
                    device: target,
                    name,
                }),
                signer: d.id,
            },
            signature: vec![0; 64],
        };
        assert!(apply(Some(&s), &e).is_err());
    }
}
#[test]
fn moves_and_repair_ids() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    let moved = apply(
        Some(&s),
        &entry(
            &s,
            TEntryPayload::ServerMoved(IServerMoved {
                old_pin: s.server_pin,
                new_pin: [20; 32],
                new_address: "new.example".into(),
            }),
            &d,
            &key,
        ),
    )
    .unwrap();
    assert_eq!(moved.server_pin, [20; 32]);
    let done = TEntryPayload::RepairDone(IRepairDone {
        repair_id: [21; 32],
        restored_head: [22; 32],
    });
    let repaired = apply(Some(&s), &entry(&s, done.clone(), &d, &key)).unwrap();
    assert!(apply(Some(&repaired), &entry(&repaired, done, &d, &key)).is_err());
}
