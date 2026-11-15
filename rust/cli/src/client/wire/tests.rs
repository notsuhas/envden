use super::transport::{IHttpRequest, ITransport, UreqTransport};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    net::TcpListener,
    time::Duration,
};

fn fetch_response(
    status: &str,
    body: Vec<u8>,
    manual: bool,
) -> envden_core::errors::Result<super::transport::IHttpResponse> {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let status = status.to_owned();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0; 4096];
        let received = stream.read(&mut request).unwrap();
        assert!(received > 0);
        write!(
            stream,
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .unwrap();
        let _ = stream.write_all(&body);
    });
    let result = UreqTransport.fetch(IHttpRequest {
        url: format!("http://{address}/v1/blobs").parse().unwrap(),
        method: "GET".into(),
        headers: BTreeMap::new(),
        body: vec![],
        timeout: Duration::from_secs(15),
        allow_redirect_response: manual,
    });
    server.join().unwrap();
    result
}

#[test]
fn response_body_has_no_ten_mebibyte_limit() {
    let size = 10 * 1024 * 1024 + 1;
    let response = fetch_response("200 OK", vec![b'x'; size], false).unwrap();
    assert_eq!(response.body.len(), size);
}

#[test]
fn redirects_are_refused_except_for_manual_release_lookup() {
    use envden_core::errors::ErrorCode;
    for status in [
        "301 Moved Permanently",
        "302 Found",
        "303 See Other",
        "307 Temporary Redirect",
        "308 Permanent Redirect",
    ] {
        let error = fetch_response(status, vec![], false).unwrap_err();
        assert_eq!(error.code, ErrorCode::ServerUnreachable);
        assert_eq!(
            error.message,
            "Server unreachable; check the server address and your private network"
        );
        assert!((300..400).contains(&fetch_response(status, vec![], true).unwrap().status));
    }
}

#[test]
fn malformed_error_json_uses_reference_message() {
    let response = fetch_response(
        "500 Internal Server Error",
        b"<html>unavailable</html>".to_vec(),
        false,
    )
    .unwrap();
    let error = super::errors::response_error(&response.json().unwrap_or_default(), "/v1/head");
    assert_eq!(error.code, envden_core::errors::ErrorCode::InvalidData);
    assert_eq!(error.message, "Invalid server response");
}

#[test]
fn non_redirect_three_hundred_status_is_a_server_response() {
    let response = fetch_response("304 Not Modified", vec![], false).unwrap();
    assert_eq!(response.status, 304);
    assert!(!response.ok());
    let error = super::errors::response_error(&response.json().unwrap_or_default(), "/v1/head");
    assert_eq!(error.message, "Invalid server response");
}
