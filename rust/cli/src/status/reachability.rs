use envden_core::errors::{EnvdenError, ErrorCode};
use std::error::Error;

pub fn server_reachability(error: &EnvdenError) -> (&'static str, String) {
    if error.code != ErrorCode::ServerUnreachable {
        return ("error", error.message.to_string());
    }
    let mut cause = error.source();
    while let Some(current) = cause {
        if let Some(io) = current.downcast_ref::<std::io::Error>() {
            let reason = match io.kind() {
                std::io::ErrorKind::ConnectionRefused => "connection refused",
                std::io::ErrorKind::ConnectionReset => "connection reset",
                std::io::ErrorKind::TimedOut => "timed out",
                _ => "network error",
            };
            return ("unreachable", reason.into());
        }
        if let Some(ureq) = current.downcast_ref::<ureq::Error>() {
            let reason = match ureq {
                ureq::Error::Timeout(_) => Some("timed out"),
                ureq::Error::HostNotFound => Some("address not found"),
                ureq::Error::Tls(_) => Some("TLS certificate rejected"),
                _ => None,
            };
            if let Some(reason) = reason {
                return ("unreachable", reason.into());
            }
        }
        cause = current.source();
    }
    ("unreachable", "network error".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transport_and_protocol_errors_are_distinct() {
        for (kind, reason) in [
            (std::io::ErrorKind::ConnectionRefused, "connection refused"),
            (std::io::ErrorKind::ConnectionReset, "connection reset"),
            (std::io::ErrorKind::TimedOut, "timed out"),
        ] {
            let error = EnvdenError::with_source(
                ErrorCode::ServerUnreachable,
                "unreachable",
                std::io::Error::from(kind),
            );
            assert_eq!(server_reachability(&error), ("unreachable", reason.into()));
        }
        assert_eq!(
            server_reachability(&EnvdenError::new(ErrorCode::Unauthorized, "bad pin")),
            ("error", "bad pin".into())
        );
    }
}
