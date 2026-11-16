use super::*;
use crate::{client::text, identity::device_identity, state::repository::load_state};
use envden_protocol::protocol as p;
use std::rc::Rc;

#[test]
fn pull_follows_signed_move_before_reconciliation() {
    let (_dir, adapters, mut server, _) = fixture::fixture();
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        "laptop",
        false,
        (adapters.now)(),
    )
    .unwrap();
    let destination = p::generate_device_keys(p::random_bytes);
    let pin = p::server_pin(&destination.recovery.obj_pub).unwrap();
    let old = server.headers.last().unwrap().clone();
    let entry = p::sign_object(
        p::TEntry {
            vault_id: old.body.vault_id,
            seq: old.body.list_seq + 1,
            parent: old.body.list_head,
            change: p::TEntryPayload::ServerMoved(p::IServerMoved {
                old_pin: p::server_pin(&server.keys.recovery.obj_pub).unwrap(),
                new_pin: pin,
                new_address: "https://destination.test".into(),
            }),
            signer: identity.record.id,
        },
        &identity.keys.obj_sk,
        "entry",
    )
    .unwrap();
    let mut body = old.body.clone();
    body.seq += 1;
    body.prev = p::object_hash(&old, "manifest").unwrap();
    body.list_seq = entry.body.seq;
    body.list_head = p::object_hash(&entry, "entry").unwrap();
    body.op = 10;
    let header = p::sign_object(body, &identity.keys.obj_sk, "manifest").unwrap();
    let value = Rc::get_mut(&mut server).unwrap();
    value.entries.push(entry);
    value.headers.push(header);
    value.destination = Some(destination);
    let options = ISyncOptions {
        unlock: None,
        now: adapters.now,
        cwd: Some(adapters.user_home.clone()),
        all: true,
        yes: true,
        interactive: false,
        choose: None,
        confirm: None,
        report: None,
    };
    let unlocked = std::cell::Cell::new(false);
    super::super::engine::sync_with_unlock(
        &adapters,
        options,
        server.clone(),
        false,
        Some(&|client, vault_id| {
            assert_eq!(client.options.address, "https://destination.test");
            assert_eq!(*vault_id, old.body.vault_id);
            assert_eq!(
                server.requests.borrow().last().unwrap(),
                "destination.test/v1/swap"
            );
            unlocked.set(true);
            Ok(())
        }),
    )
    .unwrap();
    assert!(unlocked.get());
    let state = load_state(&adapters.home).unwrap().unwrap();
    assert_eq!(state["server"]["address"], "https://destination.test");
    assert_eq!(state["server"]["pin"], text(&pin));
    assert!(
        server
            .requests
            .borrow()
            .iter()
            .any(|r| r == "destination.test/v1/swap")
    );
}
