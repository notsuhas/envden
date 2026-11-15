pub fn allowed_host(host: Option<&str>, port: u16) -> bool {
    host.is_some_and(|h| h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"))
}

pub fn same_origin(origin: Option<&str>, host: Option<&str>) -> bool {
    match (origin, host) {
        (Some(origin), Some(host)) if !origin.is_empty() && !host.is_empty() => {
            origin == format!("http://{host}")
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loopback_only_and_exact_origin() {
        for host in [
            None,
            Some("evil:1234"),
            Some("127.0.0.1"),
            Some("localhost:1235"),
            Some("[::1]:1234"),
        ] {
            assert!(!allowed_host(host, 1234));
        }
        assert!(allowed_host(Some("127.0.0.1:1234"), 1234));
        assert!(allowed_host(Some("localhost:1234"), 1234));
        assert!(same_origin(
            Some("http://localhost:1234"),
            Some("localhost:1234")
        ));
        assert!(!same_origin(
            Some("https://localhost:1234"),
            Some("localhost:1234")
        ));
        assert!(!same_origin(None, Some("localhost:1234")));
    }
}
