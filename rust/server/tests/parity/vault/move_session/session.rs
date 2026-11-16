use super::*;
#[tokio::test]
async fn move_chain_protocol_errors_are_input_errors() {
    let v = VaultFixture::new();
    let f = &v.f;
    let request = token_request(
        f,
        "/v1/move/session",
        "POST",
        &[],
        &f.member,
        TTokenKind::Setup,
        &v.setup,
    );
    assert_eq!(f.run(request).await.0, 200);
    for (bytes, status, code) in [
        (vec![0, 0, 0, 1], 400, "INVALID_INPUT"),
        (
            {
                let mut bytes = vec![0; 40];
                bytes[3] = 1;
                bytes.extend([2, 255]);
                bytes
            },
            426,
            "SERVER_TOO_OLD",
        ),
    ] {
        assert_eq!(
            f.run(f.request("/v1/move/chain", "POST", &bytes, &f.member, |_| {}))
                .await,
            (status, json!({"error":code}))
        );
    }
}
