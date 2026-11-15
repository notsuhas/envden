use crate::support::Fixture;
use envden_core::adapters::storage::IStoredDevice;
use serde_json::{Value, json};

#[tokio::test]
async fn read_period_and_window_require_unlock_but_not_fresh_login() {
    for period in [None, Some(86400000)] {
        let f = Fixture::new();
        let path = "/v1/settings/unlock-period";
        for route in [path, "/v1/unlock-window"] {
            assert_eq!(
                f.send(route, "GET", Value::Null, &f.member).await,
                (403, json!({"error":"LOCKED"}))
            );
        }
        assert_eq!(
            f.send(path, "GET", Value::Null, &f.joiner).await,
            (403, json!({"error":"NOT_MEMBER"}))
        );
        let mut vault = f.options.storage.vault(&f.vault).unwrap().unwrap();
        vault.unlock_period = period;
        f.options
            .storage
            .configure_vault(&f.vault, &vault, &[], None)
            .unwrap();
        f.options
            .storage
            .put_device(
                &f.vault,
                &f.member.record.id,
                &IStoredDevice {
                    unlocked_until: f.now() + 10000,
                    fresh_until: 0,
                    client_version: "1.0.0".into(),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(
            f.send(path, "GET", Value::Null, &f.member).await,
            (200, json!({"period":period}))
        );
        assert_eq!(
            f.send("/v1/unlock-window", "GET", Value::Null, &f.member)
                .await,
            (
                200,
                json!({"unlockedUntil":period.map(|_|f.now()+10000),"freshUntil":0})
            )
        );
        assert_eq!(
            f.send(path, "PUT", json!({"period":period}), &f.member)
                .await,
            (403, json!({"error":"LOCKED"}))
        );
    }
}

#[tokio::test]
async fn fresh_and_unlocked_boundaries_and_never_period() {
    let f = Fixture::new();
    let path = "/v1/settings/unlock-period";
    assert_eq!(
        f.send(path, "PUT", json!({"period":null}), &f.member).await,
        (403, json!({"error":"LOCKED"}))
    );
    assert_eq!(
        f.send("/v1/devices", "GET", Value::Null, &f.member).await,
        (403, json!({"error":"LOCKED"}))
    );
    f.fresh();
    let mut prior = f
        .options
        .storage
        .device(&f.vault, &f.member.record.id)
        .unwrap()
        .unwrap();
    prior.unlocked_until = 9007199254740991;
    f.options
        .storage
        .put_device(&f.vault, &f.member.record.id, &prior)
        .unwrap();
    assert_eq!(
        f.send(path, "PUT", json!({"period":86400000}), &f.member)
            .await,
        (200, json!({"period":86400000}))
    );
    assert!(
        f.options
            .storage
            .device(&f.vault, &f.member.record.id)
            .unwrap()
            .unwrap()
            .unlocked_until
            <= f.now() + 86400000
    );
    assert_eq!(
        f.send(path, "PUT", json!({"period":1}), &f.member).await,
        (400, json!({"error":"INVALID_INPUT"}))
    );
    assert_eq!(
        f.send(path, "PUT", json!({"period":null}), &f.member).await,
        (200, json!({"period":null}))
    );
    f.advance(10000);
    assert_eq!(
        f.send(path, "PUT", json!({"period":null}), &f.member).await,
        (403, json!({"error":"LOCKED"}))
    );
    assert_eq!(
        f.send("/v1/devices", "GET", Value::Null, &f.member).await.0,
        200
    );
}
