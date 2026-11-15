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
