use super::*;
use crate::http::types::IServerKeys;
use envden_core::adapters::storage::IStoredHeader;
use envden_testing::storage::IFakeStorageAdapter;
use std::sync::{Arc, Mutex};

fn header(hash: [u8; 32], op: u8) -> IStoredHeader {
    let header = sign_object(
        IManifestHeader {
            vault_id: [1; 32],
            seq: 2,
            op,
            prev: [0; 32],
            list_seq: 0,
            list_head: [0; 32],
            epoch: 1,
            keyring_hash: [0; 32],
            files_hash: hash,
            envelope_hash: [0; 32],
            created_at: 1,
            signer: [0; 16],
        },
        &[0; 32],
        "manifest",
    )
    .unwrap();
    IStoredHeader {
        hash: object_hash(&header, "manifest").unwrap().to_vec(),
        bytes: encode(&header).unwrap(),
        seq: 2,
    }
}

#[test]
fn restoration_validates_encoding_hash_references_retention_and_versions() {
    let files = IFiles {
        entries: vec![IFileEntry {
            file_id: [2; 32],
            version: 2,
            epoch: 1,
            state: 1,
            blob_hash: [3; 32],
            name: vec![4; 32],
        }],
    };
    let bytes = encode(&files).unwrap();
    let hash = h("files", &bytes);
    let referenced = Arc::new(Mutex::new(vec![header(hash, 1)]));
    let references = referenced.clone();
    let writes = Arc::new(Mutex::new(vec![]));
    let captured = writes.clone();
    let storage = IFakeStorageAdapter {
        headers_for_files: Some(Box::new(move |_, _| Ok(references.lock().unwrap().clone()))),
        put_file_list: Some(Box::new(move |_, files, now| {
            assert_eq!(now, 1000000);
            captured.lock().unwrap().push(files.clone());
            Ok(())
        })),
        ..Default::default()
    };
    let mut options = IAppOptions {
        storage: Arc::new(storage),
        storage_lock: Arc::new(Mutex::new(())),
        now: Arc::new(|| 1000000),
        server_keys: IServerKeys {
            secret_key: [0; 32],
            public_key: [0; 32],
            opaque_setup: String::new(),
        },
        app_version: "1.0.0".into(),
        min_client: "1.0.0".into(),
    };
    assert_eq!(
        restore_files(&options, &[1; 32], &hash, &[255])
            .unwrap_err()
            .code,
        ErrorCode::InvalidInput
    );
    assert_eq!(
        restore_files(&options, &[1; 32], &[0; 32], &bytes)
            .unwrap_err()
            .message,
        "Files hash mismatch"
    );
    referenced.lock().unwrap().clear();
    assert_eq!(
        restore_files(&options, &[1; 32], &hash, &bytes)
            .unwrap_err()
            .message,
        "Unreferenced files"
    );
    assert!(writes.lock().unwrap().is_empty());
    for position in ["none", "current", "previous"] {
        *referenced.lock().unwrap() = match position {
            "none" => vec![header(hash, 1)],
            "current" => vec![header(hash, 11)],
            _ => vec![header(hash, 1), header([9; 32], 11)],
        };
        restore_files(&options, &[1; 32], &hash, &bytes).unwrap();
        assert_eq!(
            writes.lock().unwrap().last().unwrap(),
            &IStoredFiles {
                hash: hash.to_vec(),
                bytes: bytes.clone(),
                retain_forever: Some(position != "none"),
                versions: vec![IFileVersion {
                    file_id: vec![2; 32],
                    version: 2,
                    blob_hash: Some(vec![3; 32]),
                    tombstone: false
                }]
            }
        );
    }
    options.storage = Arc::new(IFakeStorageAdapter {
        headers_for_files: Some(Box::new(move |_, _| Ok(vec![header(hash, 1)]))),
        put_file_list: Some(Box::new(|_, _, _| {
            Err(EnvdenError::new(ErrorCode::NotImplemented, "Unavailable"))
        })),
        ..Default::default()
    });
    assert_eq!(
        restore_files(&options, &[1; 32], &hash, &bytes)
            .unwrap_err()
            .message,
        "File restoration unavailable"
    );
}
