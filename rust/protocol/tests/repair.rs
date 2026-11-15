mod support;
use envden_protocol::{chain::*, protocol::*};
use std::collections::BTreeSet;
use support::*;
#[test]
fn reports_bind_member_repair_vault_and_known_header() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    let head = object_hash(&header(&s, &IFiles { entries: vec![] }), "manifest").unwrap();
    let report = IRepairReport {
        vault_id: s.vault_id,
        repair_id: [1; 32],
        head,
        blobs: vec![[3; 32]],
        signer: d.id,
    };
    let good = sign_object(report, &key, "repair-report").unwrap();
    let headers = BTreeSet::from([head]);
    assert_eq!(
        filter_repair_reports(std::slice::from_ref(&good), &[1; 32], &s, &headers),
        vec![good.clone()]
    );
    assert!(missing_report_members(&s, std::slice::from_ref(&good)).is_empty());
    assert_eq!(missing_report_members(&s, &[]), vec![d]);
    for n in 0..5 {
        let mut r = good.clone();
        match n {
            0 => r.body.vault_id = [0; 32],
            1 => r.body.repair_id = [0; 32],
            2 => r.body.head = [0; 32],
            3 => r.body.signer = [0; 16],
            _ => r.signature.fill(0),
        }
        if n < 4 {
            r = sign_object(r.body, &key, "repair-report").unwrap();
        }
        assert!(filter_repair_reports(&[r], &[1; 32], &s, &headers).is_empty());
    }
    let files = IFiles {
        entries: (1..=4)
            .map(|n| IFileEntry {
                file_id: [n; 32],
                version: 1,
                epoch: 1,
                state: 1,
                blob_hash: [n; 32],
                name: vec![1],
            })
            .collect(),
    };
    let (missing, lost) = classify_missing_blobs(&files, &BTreeSet::from([[1; 32]]), &[good]);
    assert_eq!(
        missing.iter().map(|e| e.blob_hash).collect::<Vec<_>>(),
        vec![[3; 32]]
    );
    assert_eq!(lost.len(), 2);
}
#[test]
fn unknown_formats_are_verified_over_original_bytes() {
    let (s, g, _) = fixture();
    let mut body = encode(&g.body).unwrap();
    body[74] = 8;
    let sig = sign(&[1; 32], "entry", &body);
    let raw = [body, sig.to_vec()].concat();
    let members = [(g.body.signer, s.devices[&g.body.signer].obj_pub)];
    let input = IUnknownData {
        received: &raw,
        stored: None,
        mismatch: TUnknownData::Fork,
        unknown_format: false,
        current_version: "1.0.0",
        latest_version: "2.0.0",
    };
    assert!(matches!(
        decode_server_object::<TEntry>(input, &members, "entry").unwrap(),
        TServerObject::Unknown(TUnknownData::UpdateRequired)
    ));
    let mut corrupt = raw;
    corrupt[80] ^= 1;
    assert!(!verify_raw_object(&corrupt, &members, "entry"));
    assert!(!verify_raw_object(&corrupt, &members, "manifest"));
}
