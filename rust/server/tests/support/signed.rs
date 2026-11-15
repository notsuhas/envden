use axum::Router;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::storage::*;
use envden_protocol::protocol::*;
use envden_server::{
    create_app_with_budget, http::types::IAppOptions, identity::load_server_keys,
    middleware::budget::BodyBudget, status::IStatusState,
};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
};

pub struct Candidate {
    pub keys: IDeviceKeys,
    pub record: IDeviceRecord,
}

pub fn candidate(name: &str) -> Candidate {
    let keys = generate_device_keys(random_bytes);
    let record = IDeviceRecord {
        id: device_id(
            &keys.recovery.enc_pub,
            &keys.recovery.obj_pub,
            &keys.req_pub,
        ),
        name: name.into(),
        enc_pub: keys.recovery.enc_pub,
        obj_pub: keys.recovery.obj_pub,
        req_pub: keys.req_pub,
    };
    Candidate { keys, record }
}

pub struct Fixture {
    _directory: tempfile::TempDir,
    pub options: IAppOptions,
    pub app: Router,
    pub member: Candidate,
    pub joiner: Candidate,
    pub vault: [u8; 32],
    pub time: Arc<AtomicU64>,
    pub budget: BodyBudget,
}

impl Fixture {
    pub fn new() -> Self {
        Self::with_budget(BodyBudget::default())
    }

    pub fn with_budget(budget: BodyBudget) -> Self {
        let directory = tempfile::tempdir().unwrap();
        let server_keys = load_server_keys(directory.path()).unwrap();
        let member = candidate("device");
        let joiner = candidate("joiner");
        let recovery = generate_recovery_keys(random_bytes);
        let genesis = sign_object(
            TEntry {
                vault_id: [0; 32],
                seq: 0,
                parent: [0; 32],
                change: TEntryPayload::Genesis(IGenesis {
                    server_pin: [1; 32],
                    device: member.record.clone(),
                    recovery: IRecoveryRecord {
                        id: recovery_id(&recovery.enc_pub, &recovery.obj_pub),
                        enc_pub: recovery.enc_pub,
                        obj_pub: recovery.obj_pub,
                    },
                    vault_nonce: random_bytes(),
                    created_at: 1,
                }),
                signer: member.record.id,
            },
            &member.keys.recovery.obj_sk,
            "entry",
        )
        .unwrap();
        let vault = object_hash(&genesis, "entry").unwrap();
        let header = sign_object(
            IManifestHeader {
                vault_id: vault,
                seq: 1,
                prev: [0; 32],
                list_head: vault,
                list_seq: 0,
                epoch: 0,
                op: 0,
                files_hash: h("files", &encode(&IFiles { entries: vec![] }).unwrap()),
                keyring_hash: [0; 32],
                envelope_hash: [0; 32],
                created_at: 1,
                signer: member.record.id,
            },
            &member.keys.recovery.obj_sk,
            "manifest",
        )
        .unwrap();
        let time = Arc::new(AtomicU64::new(1000000));
        let clock = time.clone();
        let storage = Arc::new(create_sqlite_storage_adapter(directory.path(), 1000000).unwrap());
        storage
            .configure_vault(
                &vault,
                &IStoredVault {
                    active: true,
                    unlock_period: Some(2592000000),
                    ..Default::default()
                },
                &[],
                None,
            )
            .unwrap();
        storage
            .commit_swap(
                &vault,
                None,
                &IStoredSwap {
                    header: IStoredHeader {
                        hash: object_hash(&header, "manifest").unwrap().to_vec(),
                        seq: 1,
                        bytes: encode(&header).unwrap(),
                    },
                    entries: vec![IStoredHeader {
                        hash: vault.to_vec(),
                        seq: 0,
                        bytes: encode(&genesis).unwrap(),
                    }],
                    body_digest: random_bytes::<32>().to_vec(),
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
        storage
            .put_device(
                &vault,
                &member.record.id,
                &IStoredDevice {
                    client_version: "1.0.0".into(),
                    ..Default::default()
                },
            )
            .unwrap();
        let options = IAppOptions {
            storage,
            storage_lock: Arc::new(Mutex::new(())),
            now: Arc::new(move || clock.load(Ordering::SeqCst)),
            server_keys,
            app_version: "1.0.0".into(),
            min_client: "1.0.0".into(),
        };
        let app = create_app_with_budget(
            options.clone(),
            Arc::new(Mutex::new(IStatusState::new(1000000, None))),
            budget.clone(),
        )
        .unwrap();
        Self {
            _directory: directory,
            options,
            app,
            member,
            joiner,
            vault,
            time,
            budget,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.options.storage.close().unwrap();
    }
}
