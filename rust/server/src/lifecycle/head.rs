use crate::status::status_headers;

pub(super) fn head_response(target: &str) -> Option<Vec<u8>> {
    let uri = target.parse::<axum::http::Uri>().ok()?;
    let path = uri.path();
    let mut result = String::from("HTTP/1.1 404 Not Found\r\n");
    if matches!(path, "/" | "/v1/status") {
        for (name, value) in status_headers() {
            result.push_str(&format!("{}: {value}\r\n", title_case(name)));
        }
    }
    let content_type = if path == "/" || path.starts_with("/v1/") {
        "application/json"
    } else {
        "text/plain; charset=UTF-8"
    };
    result.push_str(&format!(
        "Content-Type: {content_type}\r\ncontent-length: 0\r\n\r\n"
    ));

    Some(result.into_bytes())
}

fn title_case(name: &str) -> String {
    name.split('-')
        .map(|part| {
            let mut chars = part.chars();
            format!(
                "{}{}",
                chars.next().expect("header segment").to_ascii_uppercase(),
                chars.as_str()
            )
        })
        .collect::<Vec<_>>()
        .join("-")
}
