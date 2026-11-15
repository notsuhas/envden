use super::super::{
    context::repair_context,
    finish::{TFinish, finish_repair},
    upload::upload_repair,
};
use super::fixture::fixture;
use crate::{
    client::{binary, text},
    identity::device_identity,
    state::repository::save_state,
};
use envden_protocol::protocol as p;
#[test]
fn wrong_server_token_refused_without_network() {
    let (_dir, adapters, server, _token) = fixture();
    let token = p::encode_token(p::TTokenKind::Repair, &[7; 20], &[9; 32]);
    assert_eq!(
        repair_context(&adapters, &token, server.clone())
            .err()
            .unwrap()
            .message,
        "Repair token is for another server"
    );
    assert!(server.requests.borrow().is_empty());
}

#[test]
fn missing_reports_identify_device_without_password_exchange() {
    let (_dir, adapters, server, token) = fixture();
    let result = finish_repair(&adapters, &token, "unused", &[], false, server.clone()).unwrap();
    assert!(matches!(result,TFinish::MissingReports(names) if names==["laptop"]));
}

#[test]
fn upload_saves_restore_evidence_and_signed_report() {
    let (_dir, adapters, server, token) = fixture();
    upload_repair(&adapters, &token, server.clone()).unwrap();
    let report: p::ISigned<p::IRepairReport> =
        p::decode(&binary(&server.reports.borrow()[0]).unwrap()).unwrap();
    assert_eq!(report.body.repair_id, server.id);
    let p::TEntryPayload::Genesis(genesis) = &server.entries[0].body.change else {
        panic!("genesis")
    };
    assert!(p::verify_object(
        &report,
        &genesis.device.obj_pub,
        "repair-report"
    ));
    assert!(
        adapters
            .home
            .join("state")
            .join(format!("repair-restored-{}", text(&server.id)))
            .exists()
    );
    assert!(report.body.blobs.is_empty());
}

#[test]
fn reused_token_refused_before_network() {
    let (_dir, adapters, server, token) = fixture();
    let mut local = crate::state::repository::load_state(&adapters.home)
        .unwrap()
        .unwrap();
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        "laptop",
        false,
        (adapters.now)(),
    )
    .unwrap();
    let entry = p::sign_object(
        p::TEntry {
            vault_id: server.headers[0].body.vault_id,
            seq: 3,
            parent: p::object_hash(&server.entries[1], "entry").unwrap(),
            change: p::TEntryPayload::RepairDone(p::IRepairDone {
                repair_id: server.id,
                restored_head: p::object_hash(&server.headers[0], "manifest").unwrap(),
            }),
            signer: identity.record.id,
        },
        &identity.keys.obj_sk,
        "entry",
    )
    .unwrap();
    local["entries"]
        .as_array_mut()
        .unwrap()
        .push(text(&p::encode(&entry).unwrap()).into());
    save_state(&adapters.home, &local, (adapters.now)()).unwrap();
    assert_eq!(
        repair_context(&adapters, &token, server.clone())
            .err()
            .unwrap()
            .message,
        "Repair token was already used"
    );
    assert!(server.requests.borrow().is_empty());
}

#[test]
fn cached_blob_corruption_is_refused_before_upload() {
    let (_dir, adapters, server, token) = fixture();
    let mut local = crate::state::repository::load_state(&adapters.home)
        .unwrap()
        .unwrap();
    let hash = [8; 32];
    let files = p::IFiles {
        entries: vec![p::IFileEntry {
            file_id: [1; 32],
            version: 1,
            epoch: 1,
            state: 1,
            blob_hash: hash,
            name: vec![0; 64],
        }],
    };
    local["files"] = text(&p::encode(&files).unwrap()).into();
    save_state(&adapters.home, &local, (adapters.now)()).unwrap();
    crate::state::files::atomic_write(
        &adapters.home.join("state/blobs").join(text(&hash)),
        b"corrupt",
        (adapters.now)(),
    )
    .unwrap();
    assert_eq!(
        upload_repair(&adapters, &token, server.clone())
            .unwrap_err()
            .message,
        "Cached blob hash mismatch"
    );
    assert!(
        !server
            .requests
            .borrow()
            .iter()
            .any(|p| p.starts_with("/v1/blobs/"))
    );
}

#[test]
fn close_from_another_repair_is_discarded_without_network() {
    let (_dir, adapters, server, token) = fixture();
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        "laptop",
        false,
        (adapters.now)(),
    )
    .unwrap();
    let history = crate::vault::history::IVaultHistory {
        entries: server.entries.clone(),
        headers: server.headers.clone(),
        state: match envden_protocol::chain::verify_chain(&server.entries).unwrap() {
            envden_protocol::chain::TDeviceListResult::Valid { state } => *state,
            _ => panic!("chain"),
        },
        states: Default::default(),
    };
    let swap =
        crate::admin::shared::swap::admin_swap(&history, &identity, 12, (adapters.now)(), vec![])
            .unwrap();
    let path = adapters.home.join("state/repair-close");
    crate::state::files::atomic_write(
        &path,
        text(&p::encode(&swap).unwrap()).as_bytes(),
        (adapters.now)(),
    )
    .unwrap();
    assert!(
        super::super::resume::resume_close(&adapters, &token, server.clone())
            .unwrap()
            .is_none()
    );
    assert!(!path.exists());
    assert!(server.requests.borrow().is_empty());
}

#[test]
fn pre_command_remote_refresh_writes_notice_cache() {
    struct NoUpdates;
    impl crate::updates::fetch::IFetcher for NoUpdates {
        fn fetch(
            &self,
            _: &str,
            _: crate::updates::fetch::TRedirect,
            _: std::time::Duration,
        ) -> envden_core::errors::Result<crate::updates::fetch::IResponse> {
            panic!("local update opt-out must not fetch")
        }
    }
    let (_dir, adapters, server, _token) = fixture();
    crate::settings::set_config(
        "update-check",
        "off",
        &adapters.home,
        (adapters.now)(),
        false,
    )
    .unwrap();
    let result = crate::notice::command::command_notice_with_transport(
        &adapters,
        (adapters.now)(),
        &NoUpdates,
        false,
        None,
        false,
        server,
    );
    assert_eq!(result["repos"], serde_json::json!([]));
    let remote = crate::notice::remote::read_remote_notice(&adapters.home)
        .unwrap()
        .unwrap();
    assert!(remote.repos.is_empty());
    assert_eq!(remote.checked_at, (adapters.now)() as f64);
}
