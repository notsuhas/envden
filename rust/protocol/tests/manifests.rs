mod support;
use envden_core::errors::ErrorCode;
use envden_protocol::{chain::*, protocol::*};
use std::collections::BTreeSet;
use support::*;

#[path = "manifests/source.rs"]
mod source;
use source::Source;

#[test]
fn accepts_descending_signed_manifests_and_preserves_source_errors() {
    let (s, g, e) = fixture();
    let files = IFiles { entries: vec![] };
    let previous = header(&s, &files);
    let (d, key) = device(1);
    let rename = entry(
        &s,
        TEntryPayload::RenameDevice(IRenameDevice {
            device: d.id,
            name: "laptop".into(),
        }),
        &d,
        &key,
    );
    let next_state = apply(Some(&s), &rename).unwrap();
    let mut h = previous.body.clone();
    h.seq += 1;
    h.prev = object_hash(&previous, "manifest").unwrap();
    h.op = 13;
    h.list_seq = next_state.seq;
    h.list_head = next_state.head;
    let head = sign_object(h, &key, "manifest").unwrap();
    let mut source = Source {
        headers: [(
            object_hash(&previous, "manifest").unwrap(),
            previous.clone(),
        )]
        .into(),
        entries: [g, e, rename]
            .into_iter()
            .map(|e| (object_hash(&e, "entry").unwrap(), e))
            .collect(),
        files: files.clone(),
        fail: None,
    };
    let c = ICheckpoint {
        header: previous.clone(),
        files,
        state: s,
        id_key: [9; 32],
    };
    assert!(matches!(
        accept_manifest(
            &c,
            &head,
            std::slice::from_ref(&previous),
            &source,
            &BTreeSet::new()
        )
        .unwrap(),
        TManifestResult::Accepted { .. }
    ));
    assert!(matches!(
        accept_manifest(
            &c,
            &previous,
            std::slice::from_ref(&previous),
            &source,
            &BTreeSet::new()
        )
        .unwrap(),
        TManifestResult::Unchanged
    ));
    for field in 0..8 {
        let mut body = head.body.clone();
        match field {
            0 => (),
            1 => body.vault_id = [0; 32],
            2 => body.epoch = 0,
            3 => body.keyring_hash = [0; 32],
            4 => body.envelope_hash = [0; 32],
            5 => body.signer = c.state.recovery.id,
            6 => body.list_seq += 1,
            _ => body.prev = [0; 32],
        }
        let mut bad = sign_object(body, &key, "manifest").unwrap();
        if field == 0 {
            bad.signature.fill(0);
        }
        assert!(
            matches!(
                accept_manifest(
                    &c,
                    &bad,
                    std::slice::from_ref(&previous),
                    &source,
                    &BTreeSet::new()
                )
                .unwrap(),
                TManifestResult::Invalid
            ),
            "field {field}"
        );
    }
    let TManifestResult::Accepted { checkpoint, .. } = accept_manifest(
        &c,
        &head,
        std::slice::from_ref(&previous),
        &source,
        &BTreeSet::new(),
    )
    .unwrap() else {
        panic!("valid manifest rejected")
    };
    assert!(matches!(
        accept_manifest(
            &checkpoint,
            &previous,
            &[previous.clone(), head.clone()],
            &source,
            &BTreeSet::new()
        )
        .unwrap(),
        TManifestResult::Rollback
    ));
    let mut body = previous.body.clone();
    body.created_at += 1;
    let fork = sign_object(body, &key, "manifest").unwrap();
    assert!(matches!(
        accept_manifest(
            &c,
            &fork,
            std::slice::from_ref(&previous),
            &source,
            &BTreeSet::new()
        )
        .unwrap(),
        TManifestResult::Fork
    ));
    let mut bad = fork;
    bad.signature.fill(0);
    assert!(matches!(
        accept_manifest(
            &c,
            &bad,
            std::slice::from_ref(&previous),
            &source,
            &BTreeSet::new()
        )
        .unwrap(),
        TManifestResult::Invalid
    ));
    for method in ["header", "files"] {
        for code in [
            ErrorCode::Internal,
            ErrorCode::NotFound,
            ErrorCode::InvalidData,
        ] {
            source.fail = Some((method, code));
            let error = accept_manifest(
                &c,
                &head,
                std::slice::from_ref(&previous),
                &source,
                &BTreeSet::new(),
            )
            .err()
            .unwrap();
            assert_eq!(error.message, "source failure");
            assert_eq!(error.code, code);
        }
    }
}
