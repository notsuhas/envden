use super::*;

#[test]
fn wrong_server_pin_and_bad_signature_are_unauthorized() {
    let (_directory, options, headers) = request(1000000, Some([0; 32]), "1.0.0");
    assert_eq!(
        verify_headers(
            &options,
            &Method::GET,
            &Uri::from_static("/v1/head"),
            &headers
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::Unauthorized
    );
    let (_directory, options, mut headers) = request(1000000, None, "1.0.0");
    headers.insert("envden-signature", text(&[0; 64]).parse().unwrap());
    assert_eq!(
        verify_headers(
            &options,
            &Method::GET,
            &Uri::from_static("/v1/head"),
            &headers
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::Unauthorized
    );
}

#[test]
fn binds_method_and_query_exactly() {
    let (_directory, options, headers) = request(1000000, None, "1.0.0");
    for (method, uri) in [(Method::POST, "/v1/head"), (Method::GET, "/v1/head?x=1")] {
        assert_eq!(
            verify_headers(&options, &method, &uri.parse().unwrap(), &headers)
                .err()
                .unwrap()
                .code,
            ErrorCode::Unauthorized
        );
    }
}

#[test]
fn binds_mirrored_headers() {
    for (name, value) in [
        ("envden-device", text(&[0; 16])),
        ("envden-time", "01000000".into()),
        ("envden-nonce", text(&[0; 16])),
        ("envden-body-hash", text(&[0; 32])),
    ] {
        let (_directory, options, mut headers) = request(1000000, None, "1.0.0");
        headers.insert(
            axum::http::HeaderName::from_static(name),
            value.parse().unwrap(),
        );
        assert_eq!(
            verify_headers(
                &options,
                &Method::GET,
                &Uri::from_static("/v1/head"),
                &headers
            )
            .err()
            .unwrap()
            .code,
            ErrorCode::Unauthorized,
            "{name}"
        );
    }
}

#[test]
fn verifies_signature_before_minimum_version() {
    let (_directory, mut options, mut headers) = request(1000000, None, "0.1.0");
    options.min_client = "1.0.0".into();
    assert_eq!(
        verify_headers(
            &options,
            &Method::GET,
            &Uri::from_static("/v1/head"),
            &headers
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::ClientTooOld
    );
    headers.insert("envden-signature", text(&[0; 64]).parse().unwrap());
    assert_eq!(
        verify_headers(
            &options,
            &Method::GET,
            &Uri::from_static("/v1/head"),
            &headers
        )
        .err()
        .unwrap()
        .code,
        ErrorCode::Unauthorized
    );
}
