use super::fixture::fixture;
use crate::{client::text, identity::device_identity};
use envden_protocol::protocol as p;
use std::rc::Rc;

struct NoUpdates;
impl crate::updates::fetch::IFetcher for NoUpdates {
    fn fetch(
        &self,
        _: &str,
        _: crate::updates::fetch::TRedirect,
        _: std::time::Duration,
    ) -> envden_core::errors::Result<crate::updates::fetch::IResponse> {
        panic!("update check disabled")
    }
}

#[test]
fn pre_command_discovers_and_marks_recovery_join_once() {
    let (_dir, adapters, mut server, _token) = fixture();
    crate::settings::set_config(
        "update-check",
        "off",
        &adapters.home,
        (adapters.now)(),
        false,
    )
    .unwrap();
    let _own = device_identity(
        &*adapters.keychain,
        &adapters.home,
        "laptop",
        false,
        (adapters.now)(),
    )
    .unwrap();
    let beta = p::generate_device_keys(p::random_bytes);
    let device = p::IDeviceRecord {
        id: p::device_id(
            &beta.recovery.enc_pub,
            &beta.recovery.obj_pub,
            &beta.req_pub,
        ),
        name: "beta".into(),
        enc_pub: beta.recovery.enc_pub,
        obj_pub: beta.recovery.obj_pub,
        req_pub: beta.req_pub,
    };
    let current = Rc::get_mut(&mut server).unwrap();
    let key = adapters
        .keychain
        .get(&format!("envden/{}/epoch/1", adapters.home.display()), true)
        .unwrap()
        .unwrap();
    let vault_id = current.headers[0].body.vault_id;
    let wrap = p::seal_wrap(
        &p::fixed(&key).unwrap(),
        &vault_id,
        1,
        &device.id,
        &device.enc_pub,
        &p::random_bytes(),
    )
    .unwrap();
    let entry = p::sign_object(
        p::TEntry {
            vault_id,
            seq: 2,
            parent: p::object_hash(&current.entries[1], "entry").unwrap(),
            signer: p::recovery_id(&current.recovery.enc_pub, &current.recovery.obj_pub),
            change: p::TEntryPayload::AddDevice(p::IAddDevice { device, wrap }),
        },
        &current.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let hash = p::object_hash(&entry, "entry").unwrap();
    let mut body = current.headers[0].body.clone();
    body.seq = 2;
    body.prev = p::object_hash(&current.headers[0], "manifest").unwrap();
    body.list_seq = 2;
    body.list_head = hash;
    body.op = 3;
    body.signer = p::device_id(
        &beta.recovery.enc_pub,
        &beta.recovery.obj_pub,
        &beta.req_pub,
    );
    current
        .headers
        .push(p::sign_object(body, &beta.recovery.obj_sk, "manifest").unwrap());
    current.entries.push(entry);
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
    let seen = std::fs::read_to_string(adapters.home.join("state/recovery-notice")).unwrap();
    assert_eq!(seen, serde_json::json!([text(&hash)]).to_string());
    assert_eq!(
        std::fs::read_to_string(adapters.home.join("state/pending-recovery.json")).unwrap(),
        "{}"
    );
    let remote = std::fs::read_to_string(adapters.home.join("state/remote-notice.json")).unwrap();
    assert_eq!(
        remote,
        format!(r#"{{"checkedAt":{},"repos":[]}}"#, (adapters.now)())
    );
}
