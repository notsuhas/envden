#[derive(Default)]
pub(super) struct WireFormat {
    remaining: usize,
}

impl WireFormat {
    pub fn encode(&mut self, mut bytes: &[u8]) -> Vec<u8> {
        let mut output = Vec::with_capacity(bytes.len());
        while !bytes.is_empty() {
            if self.remaining > 0 {
                let length = self.remaining.min(bytes.len());
                output.extend_from_slice(&bytes[..length]);
                self.remaining -= length;
                bytes = &bytes[length..];
                continue;
            }
            let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") else {
                output.extend_from_slice(bytes);
                break;
            };
            if !bytes.starts_with(b"HTTP/1.") {
                output.extend_from_slice(bytes);
                break;
            }
            let end = end + 4;
            let head = String::from_utf8_lossy(&bytes[..end]);
            if head
                .lines()
                .next()
                .is_some_and(|line| line.split_whitespace().nth(1) == Some("408"))
            {
                return output;
            }
            let length = head.lines().find_map(|line| {
                line.split_once(':')
                    .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                    .and_then(|(_, value)| value.trim().parse::<usize>().ok())
            });
            self.remaining = length.unwrap_or(0);
            if head
                .lines()
                .next()
                .is_some_and(|line| line.split_whitespace().nth(1) == Some("413"))
            {
                output.extend_from_slice(b"HTTP/1.1 413 Request Entity Too Large\r\n\r\n");
            } else if length == Some(0) {
                output.extend_from_slice(
                    head.replace("Content-Length: 0\r\n", "content-length: 0\r\n")
                        .as_bytes(),
                );
            } else {
                output.extend_from_slice(&bytes[..end]);
            }
            bytes = &bytes[end..];
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_timeout_closes_without_an_http_response() {
        assert!(
            WireFormat::default()
                .encode(b"HTTP/1.1 408 Request Timeout\r\nContent-Length: 0\r\n\r\n")
                .is_empty()
        );
    }

    #[test]
    fn persistent_responses_preserve_body_bytes_and_format_empty_headers() {
        let mut format = WireFormat::default();
        let body = b"HTTP/1.1 413 Payload Too Large\r\nContent-Length: 0\r\n\r\n";
        let head = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n", body.len());
        assert_eq!(format.encode(head.as_bytes()), head.as_bytes());
        assert_eq!(format.encode(&body[..7]), body[..7]);
        assert_eq!(format.encode(&body[7..]), body[7..]);
        assert_eq!(
            format.encode(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"),
            b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\n\r\n"
        );
        assert_eq!(
            format.encode(
                b"HTTP/1.1 413 Payload Too Large\r\nContent-Length: 0\r\nDate: ignored\r\n\r\n"
            ),
            b"HTTP/1.1 413 Request Entity Too Large\r\n\r\n"
        );
    }
}
