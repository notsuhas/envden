use super::*;

#[test]
fn changed_files_and_recovery_decisions() {
    let (s, _, _) = fixture();
    let before = IFiles { entries: vec![] };
    let e = IFileEntry {
        file_id: [1; 32],
        version: 1,
        epoch: 1,
        state: 1,
        blob_hash: [2; 32],
        name: vec![3],
    };
    let after = IFiles {
        entries: vec![e.clone()],
    };
    assert_eq!(
        changed_files(&before, &after, 1, 1, Some(1)).unwrap(),
        vec![e.clone()]
    );
    assert!(changed_files(&after, &before, 1, 1, None).is_err());
    let mut next = after.clone();
    next.entries[0].version = 2;
    next.entries[0].name = vec![4];
    next.entries[0].state = 4;
    next.entries[0].blob_hash = [0; 32];
    assert_eq!(
        changed_files(&after, &next, 1, 1, Some(11)).unwrap().len(),
        1
    );
    let h = header(&s, &after).body;
    assert!(matches!(
        choose_recovery_candidate(
            &e.file_id,
            2,
            &[(h.clone(), Some(after))],
            &BTreeSet::from([e.blob_hash])
        )
        .unwrap(),
        TRecoveryCandidate::Recovered { .. }
    ));
    assert!(matches!(
        choose_recovery_candidate(&e.file_id, 2, &[(h, None)], &BTreeSet::new()).unwrap(),
        TRecoveryCandidate::Lost
    ));
    assert_eq!(repair_login_decision(&[]), "login");
    assert!(refuse_secret_key_proof(&[], false));
    assert!(!refuse_secret_key_proof(&[], true));
}
#[test]
fn unknown_data_order_and_future_formats() {
    let (s, g, _) = fixture();
    let raw = encode(&g).unwrap();
    let members = vec![(g.body.signer, s.devices[&g.body.signer].obj_pub)];
    let i = || IUnknownData {
        received: &raw,
        stored: None,
        mismatch: TUnknownData::Fork,
        unknown_format: false,
        current_version: "1.0.0",
        latest_version: "2.0.0",
    };
    assert!(matches!(
        decode_server_object::<TEntry>(i(), &members, "entry").unwrap(),
        TServerObject::Known { .. }
    ));
    let mut input = i();
    input.unknown_format = true;
    assert_eq!(
        classify_unknown_data(input, || true).unwrap(),
        TUnknownData::UpdateRequired
    );
    let mut input = i();
    input.stored = Some(&[0]);
    assert_eq!(
        classify_unknown_data(input, || false).unwrap(),
        TUnknownData::Fork
    );
    assert_eq!(
        classify_unknown_data(i(), || false).unwrap(),
        TUnknownData::Invalid
    );
}
