use super::*;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::storage::*;

#[test]
fn history_pages_limit_rows_and_encoded_response_bytes() {
    for (count, size, expected) in [(105, 10, 100), (4, 400000, 1)] {
        let directory = tempfile::tempdir().unwrap();
        let storage = create_sqlite_storage_adapter(directory.path(), 1000000).unwrap();
        let vault = [1; 32];
        storage
            .configure_vault(
                &vault,
                &IStoredVault {
                    active: true,
                    ..Default::default()
                },
                &[],
                None,
            )
            .unwrap();
        for index in 1..=count {
            let hash = vec![index as u8; 32];
            let previous = storage.head(&vault).unwrap();
            storage
                .commit_swap(
                    &vault,
                    previous.as_deref(),
                    &IStoredSwap {
                        header: IStoredHeader {
                            hash: hash.clone(),
                            bytes: vec![0; size],
                            seq: index + 1,
                        },
                        entries: vec![],
                        body_digest: hash,
                        files_hash: None,
                        files: None,
                        state: None,
                        vault: None,
                        devices: None,
                        approver: None,
                        consume_sessions: None,
                        close_mailbox: None,
                        setup_token_hash: None,
                        clear_repair_reports: None,
                    },
                    1000000,
                )
                .unwrap();
        }
        let page = read_range(&storage, &vault, true, Some("2"), None).unwrap();
        assert_eq!(page["objects"].as_array().unwrap().len(), expected);
        let next = read_range(
            &storage,
            &vault,
            true,
            Some(&(expected + 2).to_string()),
            None,
        )
        .unwrap();
        assert!(!next["objects"].as_array().unwrap().is_empty());
        storage.close().unwrap();
    }
}
