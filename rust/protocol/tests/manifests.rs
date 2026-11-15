mod support;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain::*, protocol::*};
use std::collections::{BTreeMap, BTreeSet};
use support::*;

struct Source {
    headers: BTreeMap<[u8; 32], ISigned<IManifestHeader>>,
    entries: BTreeMap<[u8; 32], ISigned<TEntry>>,
    files: IFiles,
    fail: bool,
}

impl IChainSource for Source {
    fn header(&self, h: &[u8; 32]) -> Result<Option<ISigned<IManifestHeader>>> {
        Ok(self.headers.get(h).cloned())
    }
    fn entry(&self, h: &[u8; 32]) -> Result<Option<ISigned<TEntry>>> {
        Ok(self.entries.get(h).cloned())
    }
    fn files(&self, _: &[u8; 32]) -> Result<Option<IFiles>> {
        if self.fail {
            Err(EnvdenError::new(ErrorCode::InvalidData, "source failure"))
        } else {
            Ok(Some(self.files.clone()))
        }
    }
    fn keyring(&self, _: &[u8; 32]) -> Result<Option<Vec<u8>>> {
        Ok(None)
    }
    fn epoch_key(&self, _: u32) -> Result<Option<[u8; 32]>> {
        Ok(None)
    }
}
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
        fail: false,
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
    source.fail = true;
    let error = accept_manifest(&c, &head, &[previous], &source, &BTreeSet::new())
        .err()
        .unwrap();
    assert_eq!(error.message, "source failure");
    assert_eq!(error.code, ErrorCode::InvalidData);
}
#[test]
fn swap_roundtrip_and_rename_authorization() {
    let (s, _, _) = fixture();
    let (d, key) = device(1);
    let files = IFiles { entries: vec![] };
    let previous = header(&s, &files);
    let e = entry(
        &s,
        TEntryPayload::RenameDevice(IRenameDevice {
            device: d.id,
            name: "laptop".into(),
        }),
        &d,
        &key,
    );
    let next = apply(Some(&s), &e).unwrap();
    let expected = object_hash(&previous, "manifest").unwrap();
    let mut h = previous.body.clone();
    h.seq += 1;
    h.prev = expected;
    h.op = 13;
    h.list_head = next.head;
    h.list_seq = next.seq;
    let mut swap = ISwap {
        expected_head: expected,
        entries: vec![e],
        header: sign_object(h, &key, "manifest").unwrap(),
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    };
    assert_eq!(decode::<ISwap>(&encode(&swap).unwrap()).unwrap(), swap);
    let c = ISwapContext {
        previous,
        state: s,
        files,
        request_signer: d.id,
        missing_blobs: BTreeSet::new(),
        destination_pin: None,
        ancestor_header_hashes: BTreeSet::new(),
        repair_registration_required: false,
    };
    assert!(matches!(
        validate_swap(&swap, &c).unwrap(),
        TSwapResult::Valid {
            authorization: TAuthorization::Unlocked,
            ..
        }
    ));
    swap.approver = Some(vec![1]);
    assert!(matches!(
        validate_swap(&swap, &c).unwrap(),
        TSwapResult::Invalid
    ));
    swap.approver = None;
    swap.expected_head = [0; 32];
    assert!(matches!(
        validate_swap(&swap, &c).unwrap(),
        TSwapResult::Invalid
    ));
}
#[test]
fn operation_matrix_constraints() {
    let (s, _, _) = fixture();
    let files = IFiles { entries: vec![] };
    let previous = header(&s, &files).body;
    for op in [1, 8, 11] {
        let mut h = previous.clone();
        h.op = op;
        if op == 8 {
            h.envelope_hash = [11; 32];
        } else {
            h.files_hash = [12; 32];
        }
        assert!(operation_requirement(&previous, &h, &[], &s, false).is_ok());
        h.epoch += 1;
        assert!(operation_requirement(&previous, &h, &[], &s, false).is_err());
    }
    for op in [0, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 14] {
        let mut h = previous.clone();
        h.op = op;
        assert!(operation_requirement(&previous, &h, &[], &s, false).is_err());
    }
}
