use axum::{body::Body, http::Response};
use envden_core::errors::{EnvdenError, ErrorCode};

pub fn error_response(error: &EnvdenError, path: &str) -> Response<Body> {
    let hint = error.code == ErrorCode::Unauthorized && path.starts_with("/v1/opaque/login/");
    let body = if hint {
        format!(
            "{{\"error\":\"{}\",\"hint\":\"The vault may have moved; try the current server address\"}}",
            error.code
        )
    } else {
        format!("{{\"error\":\"{}\"}}", error.code)
    };

    response(status(error.code), "application/json", body)
}

pub(crate) fn request_error(error: &EnvdenError, path: &str, method: &str) -> Response<Body> {
    respond(error, path, method, |event| eprintln!("{event}"))
}

fn respond(
    error: &EnvdenError,
    path: &str,
    method: &str,
    log: impl FnOnce(&str),
) -> Response<Body> {
    if status(error.code) == 500 {
        log(&format!(
            "envden request failed {{\n  code: \"INTERNAL\",\n  method: {},\n  name: \"Error\",\n  frames: undefined,\n}}",
            serde_json::to_string(method).expect("method string")
        ));
    }

    error_response(error, path)
}

pub(crate) fn response(status: u16, content_type: &str, body: impl Into<Body>) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", content_type)
        .body(body.into())
        .expect("fixed response headers")
}

fn status(code: ErrorCode) -> u16 {
    use ErrorCode::*;
    match code {
        Busy => 503,
        InvalidInput | InvalidData => 400,
        UpdateRequired | ServerTooOld | ClientTooOld => 426,
        Rollback | Fork | RecoveryKitRequired | Conflict | HeadMoved | RestoredMode | Moving => 409,
        NotMember | Locked => 403,
        Unauthorized => 401,
        StorageQuota => 507,
        RateLimited => 429,
        NotFound => 404,
        NotImplemented => 501,
        Internal => 500,
        ServerUnreachable => 502,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[tokio::test]
    async fn internal_failures_log_context_without_exposing_messages() {
        let events = RefCell::new(vec![]);
        let response = respond(
            &EnvdenError::new(ErrorCode::Internal, "private database detail"),
            "/v1/devices",
            "GET",
            |event| events.borrow_mut().push(event.to_owned()),
        );
        assert_eq!(response.status(), 500);
        assert_eq!(
            axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap(),
            r#"{"error":"INTERNAL"}"#
        );
        let events = events.borrow();
        assert_eq!(events.len(), 1);
        let event = &events[0];
        for expected in [
            "envden request failed",
            "code: \"INTERNAL\"",
            "method: \"GET\"",
            "name: \"Error\"",
        ] {
            assert!(event.contains(expected));
        }
        assert!(!event.contains("private database detail"));
    }
}
