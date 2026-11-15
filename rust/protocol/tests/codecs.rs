mod support;
use envden_core::errors::ErrorCode;
use envden_protocol::protocol::*;
use support::*;
fn exact<T: ICodec + PartialEq + std::fmt::Debug>(value: T) {
    let encoded = encode(&value).unwrap();
    assert_eq!(decode::<T>(&encoded).unwrap(), value);
    let mut trailing = encoded.clone();
    trailing.push(0);
    assert!(decode::<T>(&trailing).is_err());
    assert!(decode::<T>(&encoded[..encoded.len() - 1]).is_err());
}
#[test]
fn every_payload_and_structured_codec_roundtrips() {
    let (s, g, e) = fixture();
    let (d, key) = device(1);
    let (b, _) = device(2);
    let payloads = vec![
        g.body.change,
        TEntryPayload::AddDevice(IAddDevice {
            device: b.clone(),
            wrap: IWrap {
                recipient: b.id,
                enc: [1; 32],
                ct: vec![2; 48],
            },
        }),
        TEntryPayload::RemoveDevice(IRemoveDevice {
            device: b.id,
            new_recovery: Some(s.recovery.clone()),
            change: change(&s),
        }),
        e.body.change,
        TEntryPayload::ReplaceRecovery(IReplaceRecovery {
            recovery: s.recovery.clone(),
            change: change(&s),
        }),
        TEntryPayload::ServerMoved(IServerMoved {
            old_pin: [1; 32],
            new_pin: [2; 32],
            new_address: "next.example".into(),
        }),
        TEntryPayload::RepairDone(IRepairDone {
            repair_id: [1; 32],
            restored_head: [2; 32],
        }),
        TEntryPayload::RenameDevice(IRenameDevice {
            device: d.id,
            name: "laptop".into(),
        }),
    ];
    for payload in payloads {
        let signed = entry(&s, payload, &d, &key);
        exact(signed);
    }
    exact(header(&s, &IFiles { entries: vec![] }));
    exact(IEnvelope {
        vault_id: [1; 32],
        recovery_enc_sk: [2; 32],
        recovery_obj_sk: [3; 32],
        checkpoint: [4; 32],
        sealed_at: 5,
    });
    exact(IFile {
        repo_id: "repo".into(),
        path: ".env".into(),
        content: vec![0, 1, 255],
    });
    exact(IFileName {
        repo_id: "repo".into(),
        path: ".env".into(),
    });
    exact(IKeyring {
        vault_id: [1; 32],
        epoch: 1,
        id_key: [2; 32],
        older: vec![],
    });
    exact(IPairJoiner { device: d });
    exact(IPairApprover {
        vault_id: [1; 32],
        server_pin: [2; 32],
        manifest_hash: [3; 32],
    });
    exact(IRepairReport {
        vault_id: [1; 32],
        repair_id: [2; 32],
        head: [3; 32],
        blobs: vec![[4; 32]],
        signer: [5; 16],
    });
}
#[test]
fn malformed_members_future_formats_and_ordering() {
    let (s, g, _) = fixture();
    let (d, _) = device(1);
    let mut encoded = encode(&g.body).unwrap();
    for n in [0, 1, 74] {
        let old = encoded[n];
        encoded[n] = 255;
        assert_eq!(
            decode::<TEntry>(&encoded).unwrap_err().code,
            ErrorCode::UpdateRequired
        );
        encoded[n] = old;
    }
    for public in [[0; 32], [255; 32], {
        let mut p = [0; 32];
        p[0] = 1;
        p
    }] {
        let mut d = d.clone();
        d.enc_pub = public;
        d.id = device_id(&d.enc_pub, &d.obj_pub, &d.req_pub);
        assert!(encode(&d).is_err());
    }
    let mut c = change(&s);
    c.wraps.reverse();
    assert!(encode(&c).is_err());
    c.wraps.sort_by_key(|w| w.recipient);
    c.wraps.push(c.wraps[0].clone());
    assert!(encode(&c).is_err());
    let mut f = IFileEntry {
        file_id: [1; 32],
        version: 1,
        epoch: 1,
        state: 2,
        blob_hash: [1; 32],
        name: vec![],
    };
    assert!(encode(&f).is_err());
    f.blob_hash = [0; 32];
    assert!(encode(&f).is_ok());
    f.version = 0;
    assert!(encode(&f).is_err());
}
