use crate::support::*;
use envden_protocol::{chain::*, protocol::*};
use std::collections::BTreeSet;
fn add(s: &IDeviceListState, device: IDeviceRecord) -> TEntryPayload {
    let _ = s;
    TEntryPayload::AddDevice(IAddDevice {
        wrap: IWrap {
            recipient: device.id,
            enc: [1; 32],
            ct: vec![2; 48],
        },
        device,
    })
}
pub fn swap_fixture(op: u8) -> (ISwap, ISwapContext) {
    let (mut state, _, _) = fixture();
    let (a, key) = device(1);
    let (b, bkey) = device(2);
    let (removed, _) = device(12);
    if [4, 5].contains(&op) {
        state = apply(
            Some(&state),
            &entry(&state, add(&state, removed.clone()), &a, &key),
        )
        .unwrap();
    }
    let r = generate_recovery_keys(|| [42; 32]);
    let recovery = IRecoveryRecord {
        id: recovery_id(&r.enc_pub, &r.obj_pub),
        enc_pub: r.enc_pub,
        obj_pub: r.obj_pub,
    };
    let old = IFileEntry {
        file_id: [20; 32],
        version: 1,
        epoch: 1,
        state: 1,
        blob_hash: [21; 32],
        name: vec![22; 32],
    };
    let old_files = IFiles {
        entries: if op == 11 { vec![old.clone()] } else { vec![] },
    };
    let previous = header(&state, &old_files);
    let payload = match op {
        2 | 3 => Some(add(&state, b.clone())),
        4 | 5 => {
            let mut s = state.clone();
            s.devices.remove(&removed.id);
            if op == 5 {
                s.recovery = recovery.clone();
            }
            Some(TEntryPayload::RemoveDevice(IRemoveDevice {
                device: removed.id,
                new_recovery: if op == 5 {
                    Some(recovery.clone())
                } else {
                    None
                },
                change: change(&s),
            }))
        }
        6 => Some(TEntryPayload::NewEpoch(INewEpoch {
            change: change(&state),
        })),
        7 | 9 => {
            let mut s = state.clone();
            s.recovery = recovery.clone();
            Some(TEntryPayload::ReplaceRecovery(IReplaceRecovery {
                recovery,
                change: change(&s),
            }))
        }
        10 => Some(TEntryPayload::ServerMoved(IServerMoved {
            old_pin: state.server_pin,
            new_pin: [15; 32],
            new_address: "next.example".into(),
        })),
        12 => Some(TEntryPayload::RepairDone(IRepairDone {
            repair_id: [16; 32],
            restored_head: object_hash(&previous, "manifest").unwrap(),
        })),
        13 => Some(TEntryPayload::RenameDevice(IRenameDevice {
            device: a.id,
            name: "laptop".into(),
        })),
        _ => None,
    };
    let entries = payload
        .map(|p| {
            let mut e = entry(&state, p, &a, &key);
            if op == 3 {
                e.body.signer = state.recovery.id;
                e = sign_object(e.body, &[3; 32], "entry").unwrap();
            }
            e
        })
        .into_iter()
        .collect::<Vec<_>>();
    let mut next = state.clone();
    for e in &entries {
        next = apply(Some(&next), e).unwrap();
    }
    let files = if [1, 11].contains(&op) {
        let mut e = old.clone();
        e.version = 2;
        e.name = vec![32; 32];
        e.state = if op == 11 { 4 } else { 1 };
        e.blob_hash = if op == 11 { [0; 32] } else { [23; 32] };
        Some(IFiles { entries: vec![e] })
    } else {
        None
    };
    let keyring = [4, 5, 6, 7, 9].contains(&op).then(|| vec![24; 32]);
    let envelope = [5, 7, 8, 9].contains(&op).then(|| vec![25; 32]);
    let mut h = previous.body.clone();
    h.seq += 1;
    h.prev = object_hash(&previous, "manifest").unwrap();
    h.op = op;
    h.list_seq = next.seq;
    h.list_head = next.head;
    h.epoch = next.epoch;
    if let Some(f) = &files {
        h.files_hash = h_hash("files", &encode(f).unwrap());
    }
    if let Some(k) = &keyring {
        h.keyring_hash = h_hash("keyring-blob", k);
    }
    if let Some(e) = &envelope {
        h.envelope_hash = h_hash("envelope-blob", e);
    }
    h.signer = if op == 3 { b.id } else { a.id };
    let header = sign_object(h, if op == 3 { &bkey } else { &key }, "manifest").unwrap();
    let request_signer = header.body.signer;
    let swap = ISwap {
        expected_head: object_hash(&previous, "manifest").unwrap(),
        entries,
        header,
        files,
        keyring,
        envelope,
        sk_pub: [5, 7].contains(&op).then_some(a.obj_pub),
        opaque_record: [8, 9].contains(&op).then(|| vec![27; 192]),
        approver: (op == 2).then(|| vec![28; 32]),
    };
    let c = ISwapContext {
        previous,
        state,
        files: old_files,
        request_signer,
        missing_blobs: BTreeSet::from([old.blob_hash]),
        destination_pin: None,
        ancestor_header_hashes: BTreeSet::from([swap.expected_head]),
        repair_registration_required: false,
    };
    (swap, c)
}
use envden_protocol::protocol::h as h_hash;
