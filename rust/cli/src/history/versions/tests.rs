use super::*;
fn header(seq: u64, hash: u8) -> ISigned<IManifestHeader> {
    ISigned {
        body: IManifestHeader {
            vault_id: [0; 32],
            seq,
            op: 0,
            prev: [0; 32],
            list_seq: 0,
            list_head: [0; 32],
            epoch: 1,
            keyring_hash: [0; 32],
            files_hash: [hash; 32],
            envelope_hash: [0; 32],
            created_at: 0,
            signer: [0; 16],
        },
        signature: vec![],
    }
}
fn files(version: u64) -> IFiles {
    IFiles {
        entries: vec![IFileEntry {
            file_id: [1; 32],
            version,
            epoch: 1,
            state: 1,
            blob_hash: [2; 32],
            name: vec![],
        }],
    }
}
#[test]
fn oldest_listing_header_and_pruned_lists() {
    let headers = vec![header(1, 1), header(2, 1), header(3, 2), header(4, 3)];
    let mut calls = 0;
    let walks = walk_versions(&headers, &[[1; 32]], |hash| {
        calls += 1;
        Ok(Some(files(if hash[0] == 1 { 1 } else { 2 })))
    })
    .unwrap();
    assert_eq!(calls, 3);
    let walk = &walks[&base32(&[1; 32])];
    assert!(!walk.pruned);
    assert_eq!(
        walk.versions
            .iter()
            .map(|v| v.entry.version)
            .collect::<Vec<_>>(),
        [2, 1]
    );
    assert_eq!(walk.versions[0].header.as_ref().unwrap().body.seq, 3);
    assert_eq!(walk.versions[1].header.as_ref().unwrap().body.seq, 1);
    let walks = walk_versions(&headers, &[[1; 32]], |hash| {
        Ok(if hash[0] == 1 { None } else { Some(files(2)) })
    })
    .unwrap();
    let walk = &walks[&base32(&[1; 32])];
    assert!(walk.pruned);
    assert!(walk.versions[0].header.is_none());
}
