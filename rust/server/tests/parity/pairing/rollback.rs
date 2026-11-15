use crate::support::Fixture;
use envden_core::errors::{EnvdenError, ErrorCode};
use envden_server::{create_app, status::IStatusState};
use envden_testing::storage::IFakeStorageAdapter;
use serde_json::json;
use std::sync::{Arc, Mutex};

macro_rules! forward {
    ($storage:expr,$method:ident,$($arg:ident),*) => {{let storage=$storage.clone();Box::new(move |$($arg),*|storage.$method($($arg),*))}};
}

#[tokio::test]
async fn mailbox_opening_rolls_back_when_indexing_fails() {
    let mut f = Fixture::new();
    f.fresh();
    let storage = f.options.storage.clone();
    f.options.storage = Arc::new(IFakeStorageAdapter {
        head: Some(forward!(storage, head, id)),
        header: Some(forward!(storage, header, id, hash)),
        entries: Some(forward!(storage, entries, id, from, to, limit, bytes)),
        vault: Some(forward!(storage, vault, id)),
        has_vault: Some(forward!(storage, has_vault, id)),
        device: Some(forward!(storage, device, id, who)),
        remember_nonce: Some(forward!(storage, remember_nonce, who, nonce, now)),
        open_mailbox: Some(forward!(storage, open_mailbox, id, who, now)),
        transaction: Some(forward!(storage, transaction, run)),
        close: Some(forward!(storage, close,)),
        write_state: Some(Box::new(|_, _| {
            Err(EnvdenError::new(ErrorCode::Internal, "index failed"))
        })),
        ..Default::default()
    });
    f.app = create_app(
        f.options.clone(),
        Arc::new(Mutex::new(IStatusState::new(f.now(), None))),
    )
    .unwrap();
    assert_eq!(
        f.send("/v1/pairing/mailboxes", "POST", json!({}), &f.member)
            .await,
        (500, json!({"error":"INTERNAL"}))
    );
    assert_eq!(storage.mailbox(&f.vault, 1, f.now()).unwrap(), None);
}
