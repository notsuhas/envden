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
        stream.read(&mut request).unwrap();
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

