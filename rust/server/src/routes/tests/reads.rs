use super::*;
use crate::http::types::IServerKeys;
use envden_core::adapters::storage::{IStoredHeader, IStoredVault};
use envden_protocol::protocol::IRequest;
use envden_testing::storage::IFakeStorageAdapter;
use std::sync::{Arc, Mutex};

#[tokio::test]
async fn duplicate_history_parameters_use_the_first_value() {
    for route in ["headers", "entries"] {
        for query in ["from=1&to=999&to=0", "from=1&from=999&to=999"] {
            let history = |_: &[u8], from, to, _, _| {
                Ok(if from <= 1 && to >= 1 {
                    vec![IStoredHeader {
                        hash: vec![1; 32],
                        bytes: b"1".to_vec(),
                        seq: 1,
                    }]
                } else {
                    vec![]
                })
            };
            let options = IAppOptions {
                storage: Arc::new(IFakeStorageAdapter {
                    vault: Some(Box::new(|_| {
                        Ok(Some(IStoredVault {
                            active: true,
                            ..Default::default()
                        }))
                    })),
                    device: Some(Box::new(|_, _| Ok(None))),
                    headers: Some(Box::new(history)),
                    entries: Some(Box::new(history)),
                    ..Default::default()
                }),
                storage_lock: Arc::new(Mutex::new(())),
                now: Arc::new(|| 100),
                server_keys: IServerKeys {
                    public_key: [0; 32],
                    secret_key: [0; 32],
                    opaque_setup: String::new(),
                },
                app_version: "1.0.0".into(),
                min_client: "1.0.0".into(),
            };
            let path = format!("/v1/{route}?{query}");
            let auth = IAuth {
                request: IRequest {
                    server_pin: [0; 32],
                    vault_id: [0; 32],
                    method: "GET".into(),
                    path_and_query: path.clone(),
                    body_hash: [0; 32],
                    time: 100,
                    nonce: [0; 16],
                    device: [0; 16],
                    client_version: "1.0.0".into(),
                },
                member: true,
                proof: None,
            };
            let request = Request::builder().uri(&path).body(Body::empty()).unwrap();
            let response = reads(&options, &auth, &request, &[]).unwrap().unwrap();

            assert_eq!(response.status(), 200, "{path}");
            let body = axum::body::to_bytes(response.into_body(), 1024)
                .await
                .unwrap();
            assert_eq!(body.as_ref(), br#"{"objects":["MQ"]}"#, "{path}");
        }
    }
}
