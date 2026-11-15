use crate::support::{Fixture, VaultFixture, held, prepare_join, wraps};
use envden_protocol::protocol::*;
use envden_server::http::encoding::text;
use serde_json::{Value, json};
use tower::ServiceExt;

#[tokio::test]
async fn concurrent_member_reservations_release_after_requests_finish() {
    let f = Fixture::new();
    f.fresh();
    let (body, reading, release) = held(b"{}");
    let mut request = f
        .request("/v1/swap", "POST", b"{}", &f.member, |_| {})
        .map(|_| body);
    request.headers_mut().remove("content-length");
    request
        .headers_mut()
        .insert("transfer-encoding", "chunked".parse().unwrap());
    let pending = tokio::spawn(f.app.clone().oneshot(request));
    reading.await.unwrap();
    assert_eq!(
        f.send("/v1/swap", "POST", json!({}), &f.member).await,
        (503, json!({"error":"BUSY"}))
    );
    release.send(()).unwrap();
    assert_eq!(pending.await.unwrap().unwrap().status(), 400);
    assert_eq!(
        f.send(
            "/v1/settings/unlock-period",
            "PUT",
            json!({"period":null}),
            &f.member
        )
        .await,
        (200, json!({"period":null}))
    );
}

#[tokio::test]
async fn small_declared_swaps_reserve_length_instead_of_route_capacity() {
    let f = Fixture::new();
    f.fresh();
    let (body, reading, release) = held(b"{}");
    let request = f
        .request("/v1/swap", "POST", b"{}", &f.member, |_| {})
        .map(|_| body);
    let pending = tokio::spawn(f.app.clone().oneshot(request));
    reading.await.unwrap();
    assert_eq!(
        f.send(
            "/v1/settings/unlock-period",
            "PUT",
            json!({"period":null}),
            &f.member
        )
        .await,
        (200, json!({"period":null}))
    );
    release.send(()).unwrap();
    assert_eq!(pending.await.unwrap().unwrap().status(), 400);
    assert_eq!(
        f.send("/v1/settings/unlock-period", "GET", Value::Null, &f.member)
            .await,
        (200, json!({"period":null}))
    );
}

#[tokio::test]
async fn revoked_membership_during_body_read_cannot_upload_blob() {
    let v = VaultFixture::new();
    let f = &v.f;
    assert_eq!(v.initialize().await.0, 200);
    let previous = prepare_join(&v).await;
    let blob = [8; 32];
    let hash = h("blob", &blob);
    let path = format!("/v1/blobs/{}", text(&hash));
    let (body, reading, release) = held(&blob);
    let request = f
        .request(&path, "PUT", &blob, &f.joiner, |_| {})
        .map(|_| body);
    let pending = tokio::spawn(f.app.clone().oneshot(request));
    reading.await.unwrap();
    let recovery = recovery_id(&v.recovery.enc_pub, &v.recovery.obj_pub);
    let entry = sign_object(
        TEntry {
            vault_id: f.vault,
            seq: 3,
            parent: previous.body.list_head,
            signer: f.member.record.id,
            change: TEntryPayload::RemoveDevice(IRemoveDevice {
                device: f.joiner.record.id,
                new_recovery: None,
                change: IEpochChange {
                    epoch: 2,
                    key_commit: random_bytes(),
                    wraps: wraps(&[f.member.record.id, recovery]),
                },
            }),
        },
        &f.member.keys.recovery.obj_sk,
        "entry",
    )
    .unwrap();
    let keyring = vec![9; 64];
    let mut header = previous.body.clone();
    header.op = 4;
    header.epoch = 2;
    header.list_seq = 3;
    header.list_head = object_hash(&entry, "entry").unwrap();
    header.keyring_hash = h("keyring-blob", &keyring);
    let mut remove = v.next(&previous, header, vec![entry], &f.member);
    remove.keyring = Some(keyring);
    assert_eq!(
        v.send("/v1/swap", &remove, &f.member, None).await,
        (200, json!({"kind":"committed"}))
    );
    release.send(()).unwrap();
    let response = pending.await.unwrap().unwrap();
    assert_eq!(response.status(), 403);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    assert_eq!(body, r#"{"error":"NOT_MEMBER"}"#);
    assert!(!f.options.storage.has_blob(&f.vault, &hash).unwrap());
}

#[tokio::test]
async fn discarded_import_during_blob_body_returns_internal_error() {
    let v = VaultFixture::new();
    let f = &v.f;
    let open = crate::support::token_request(
        f,
        "/v1/move/session",
        "POST",
        &[],
        &f.member,
        TTokenKind::Setup,
        &v.setup,
    );
    assert_eq!(f.run(open).await.0, 200);
    let blob = [8; 32];
    let path = format!("/v1/blobs/{}", text(&h("blob", &blob)));
    let (body, reading, release) = held(&blob);
    let request = f
        .request(&path, "PUT", &blob, &f.member, |_| {})
        .map(|_| body);
    let pending = tokio::spawn(f.app.clone().oneshot(request));
    reading.await.unwrap();
    assert_eq!(
        f.send("/v1/move/discard", "POST", Value::Null, &f.member)
            .await
            .0,
        200
    );
    release.send(()).unwrap();
    assert_eq!(pending.await.unwrap().unwrap().status(), 500);
}
