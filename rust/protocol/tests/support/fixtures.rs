use envden_protocol::{chain::*, protocol::*};

pub fn device(n: u8) -> (IDeviceRecord, [u8; 32]) {
    let sk = [n; 32];
    let keys = generate_device_keys(|| sk);
    let k = keys.recovery;
    let d = IDeviceRecord {
        id: device_id(&k.enc_pub, &k.obj_pub, &keys.req_pub),
        name: format!("device-{n}"),
        enc_pub: k.enc_pub,
        obj_pub: k.obj_pub,
        req_pub: keys.req_pub,
    };
    (d, sk)
}

pub fn entry(
    s: &IDeviceListState,
    change: TEntryPayload,
    d: &IDeviceRecord,
    key: &[u8; 32],
) -> ISigned<TEntry> {
    sign_object(
        TEntry {
            vault_id: s.vault_id,
            parent: s.head,
            seq: s.seq + 1,
            change,
            signer: d.id,
        },
        key,
        "entry",
    )
    .unwrap()
}

pub fn change(s: &IDeviceListState) -> IEpochChange {
    let mut wraps: Vec<_> = s
        .devices
        .keys()
        .copied()
        .chain(std::iter::once(s.recovery.id))
        .map(|recipient| IWrap {
            recipient,
            enc: [7; 32],
            ct: vec![8; 48],
        })
        .collect();
    wraps.sort_by_key(|w| w.recipient);
    IEpochChange {
        epoch: s.epoch + 1,
        key_commit: key_commit(&[6; 32], &s.vault_id, s.epoch + 1),
        wraps,
    }
}

pub fn fixture() -> (IDeviceListState, ISigned<TEntry>, ISigned<TEntry>) {
    let (d, sk) = device(1);
    let r = generate_recovery_keys(|| [3; 32]);
    let recovery = IRecoveryRecord {
        id: recovery_id(&r.enc_pub, &r.obj_pub),
        enc_pub: r.enc_pub,
        obj_pub: r.obj_pub,
    };
    let genesis = sign_object(
        TEntry {
            vault_id: [0; 32],
            parent: [0; 32],
            seq: 0,
            change: TEntryPayload::Genesis(IGenesis {
                server_pin: [4; 32],
                device: d.clone(),
                recovery,
                vault_nonce: [5; 32],
                created_at: 1,
            }),
            signer: d.id,
        },
        &sk,
        "entry",
    )
    .unwrap();
    let state = apply(None, &genesis).unwrap();
    let epoch = entry(
        &state,
        TEntryPayload::NewEpoch(INewEpoch {
            change: change(&state),
        }),
        &d,
        &sk,
    );
    (apply(Some(&state), &epoch).unwrap(), genesis, epoch)
}

pub fn header(s: &IDeviceListState, files: &IFiles) -> ISigned<IManifestHeader> {
    let (d, key) = device(1);
    sign_object(
        IManifestHeader {
            vault_id: s.vault_id,
            seq: 1,
            op: 0,
            prev: [0; 32],
            list_seq: s.seq,
            list_head: s.head,
            epoch: s.epoch,
            keyring_hash: [9; 32],
            files_hash: h("files", &encode(files).unwrap()),
            envelope_hash: [10; 32],
            created_at: 1,
            signer: d.id,
        },
        &key,
        "manifest",
    )
    .unwrap()
}
