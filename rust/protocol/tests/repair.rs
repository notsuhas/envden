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

#[test]
fn recovery_uses_newest_available_version_and_stops_at_tombstones_or_missing_lists() {
    let (s, _, _) = fixture();
    let mut history = Vec::new();
    for version in 1..=3 {
        let files = IFiles {
            entries: vec![IFileEntry {
                file_id: [1; 32],
                version,
                epoch: 1,
                state: 1,
                blob_hash: [version as u8; 32],
                name: vec![3; 32],
            }],
        };
        let mut h = header(&s, &files).body;
        h.seq = version;
        history.push((h, Some(files)));
    }
    let available = BTreeSet::from([[1; 32], [2; 32]]);
    let TRecoveryCandidate::Recovered { entry, .. } =
        choose_recovery_candidate(&[1; 32], 4, &history, &available).unwrap()
    else {
        panic!("no recovery candidate")
    };
    assert_eq!(entry.version, 2);
    assert!(matches!(
        choose_recovery_candidate(&[1; 32], 4, &history, &BTreeSet::new()).unwrap(),
        TRecoveryCandidate::Lost
    ));
    let mut missing = history.clone();
    missing.insert(0, (history[2].0.clone(), None));
    assert!(matches!(
        choose_recovery_candidate(&[1; 32], 4, &missing, &available).unwrap(),
        TRecoveryCandidate::Lost
    ));
    let mut deleted = history.clone();
    let files = deleted[2].1.as_mut().unwrap();
    files.entries[0].state = 2;
    files.entries[0].blob_hash = [0; 32];
    deleted[2].0.files_hash = h("files", &encode(deleted[2].1.as_ref().unwrap()).unwrap());
    assert!(matches!(
        choose_recovery_candidate(&[1; 32], 4, &deleted, &available).unwrap(),
        TRecoveryCandidate::Lost
    ));
    history[2].0.files_hash = [0; 32];
    assert!(matches!(
        choose_recovery_candidate(&[1; 32], 4, &history[2..], &available).unwrap(),
        TRecoveryCandidate::Lost
    ));
    for op in 1..=13 {
        let mut h = header(&s, &IFiles { entries: vec![] }).body;
        h.op = op;
        assert_eq!(
            repair_login_decision(&[h.clone()]),
            if [8, 9].contains(&op) {
                "register"
            } else {
                "login"
            }
        );
        assert_eq!(
            refuse_secret_key_proof(&[h.clone()], true),
            [5, 7].contains(&op)
        );
        assert!(refuse_secret_key_proof(&[h], false));
    }
    assert!(is_reused_repair_token(&[1; 32], &BTreeSet::from([[1; 32]])));
    assert!(!is_reused_repair_token(
        &[2; 32],
        &BTreeSet::from([[1; 32]])
    ));
}
