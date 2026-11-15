use crate::support::{Fixture, held};
use envden_server::{http::encoding::text, middleware::budget::TBudget};
use serde_json::json;
use sha2::{Digest, Sha256};

#[tokio::test]
async fn body_authorization_checks_signature_hash_budget_and_setup() {
    for failure in ["signature", "hash", "budget", "setup"] {
        let f = Fixture::new();
        f.fresh();
        let bytes = if failure == "signature" {
            vec![0; 1048576]
        } else {
            br#"{"period":null}"#.to_vec()
        };
        let path = if failure == "setup" {
            "/v1/vault"
        } else {
            "/v1/settings/unlock-period"
        };
        let (body, mut reading, release) = held(&bytes);
        let mut req = f
            .request(
                path,
                if failure == "setup" { "POST" } else { "PUT" },
                &bytes,
                &f.member,
                |r| {
                    if failure == "setup" {
                        r.vault_id = [9; 32];
                    }
                    if failure == "hash" {
                        r.body_hash = Sha256::digest([]).into();
                    }
                },
            )
            .map(|_| body);
        if failure == "signature" {
            req.headers_mut()
                .insert("envden-signature", text(&[0; 64]).parse().unwrap());
        }
        let _reservation = (failure == "budget")
            .then(|| f.budget.reserve(134217728, TBudget::Member, None).unwrap());
        if failure == "hash" {
            release.send(()).unwrap();
        } else {
            drop(release);
        }
        let expected = if failure == "budget" {
            (503, json!({"error":"BUSY"}))
        } else {
            (401, json!({"error":"UNAUTHORIZED"}))
        };
        assert_eq!(f.run(req).await, expected, "{failure}");
        assert_eq!(reading.try_recv().is_ok(), failure == "hash");
    }
}
