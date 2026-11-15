use crate::{
    http::{
        encoding::{binary, text},
        errors::{request_error, response},
        policy::request_route,
    },
    status::{admit_request, read_status, render_status_page, status_headers},
};
use axum::{
    body::Body,
    extract::{Request, State},
    http::Response,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::*;

use super::{authenticated::authenticated, types::AppState};

pub(super) async fn dispatch(State(state): State<AppState>, request: Request) -> Response<Body> {
    if request
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .is_some_and(|length| length > 33554432)
    {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = axum::http::StatusCode::PAYLOAD_TOO_LARGE;
        response
            .headers_mut()
            .insert("connection", axum::http::HeaderValue::from_static("close"));
        return response;
    }
    let path = request.uri().path().to_owned();
    let method = request.method().as_str().to_owned();
    let public_status = matches!(request.method().as_str(), "GET" | "HEAD")
        && matches!(path.as_str(), "/" | "/v1/status");
    let public = public_status || request.method() == "GET" && path == "/v1/hello";
    let result = if public || !path.starts_with("/v1/") {
        dispatch_inner(&state, &request)
    } else {
        authenticated(&state, request).await
    };
    let mut response = result.unwrap_or_else(|error| request_error(&error, &path, &method));
    if public_status {
        let headers = std::mem::take(response.headers_mut());
        for (key, value) in status_headers() {
            response.headers_mut().insert(
                axum::http::HeaderName::from_static(key),
                axum::http::HeaderValue::from_str(&value)
                    .unwrap_or_else(|_| axum::http::HeaderValue::from_static("")),
            );
        }
        response.headers_mut().extend(headers);
    }

    if method == "HEAD" {
        *response.body_mut() = Body::empty();
        response
            .headers_mut()
            .insert("content-length", axum::http::HeaderValue::from_static("0"));
    }

    response
}

fn dispatch_inner(state: &AppState, request: &Request) -> Result<Response<Body>> {
    let path = request.uri().path();
    let method = request.method().as_str();
    if !path.starts_with("/v1/") && !(path == "/" && matches!(method, "GET" | "HEAD")) {
        return Ok(response(404, "text/plain; charset=UTF-8", "404 Not Found"));
    }
    let has_body = request.headers().contains_key("transfer-encoding")
        || request
            .headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .is_some_and(|v| v > 0);
    let route = request_route(method, path, has_body)?;
    let _guard = state
        .options
        .storage_lock
        .lock()
        .map_err(|_| EnvdenError::new(ErrorCode::Internal, "Storage lock unavailable"))?;
    if method == "GET" && matches!(path, "/" | "/v1/status") {
        let mut status = state
            .status
            .lock()
            .map_err(|_| EnvdenError::new(ErrorCode::Internal, "Status lock unavailable"))?;
        if !status.enabled {
            return Err(EnvdenError::new(
                ErrorCode::NotFound,
                "Status page disabled",
            ));
        }
        status.window = Some(
            admit_request(status.window, (state.options.now)()).ok_or_else(|| {
                EnvdenError::new(ErrorCode::RateLimited, "Too many status requests")
            })?,
        );
        let value = read_status(&state.options, &status)?;

        return Ok(if path == "/" {
            response(
                200,
                "text/html; charset=UTF-8",
                render_status_page(&value, (state.options.now)()),
            )
        } else {
            response(200, "application/json", value.to_string())
        });
    }
    if method == "GET" && path == "/v1/hello" {
        let query = url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes());
        let challenge = query
            .into_iter()
            .find(|(key, _)| key == "challenge")
            .map(|(_, value)| value.into_owned())
            .unwrap_or_default();
        let challenge = fixed(&binary(&challenge, Some(32))?)?;
        let host = request
            .headers()
            .get("host")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("localhost");
        let host = url::Url::parse(&format!("http://{host}"))
            .ok()
            .and_then(|url| url.host_str().map(str::to_lowercase))
            .unwrap_or_else(|| "localhost".into());
        let hello = build_hello(
            IServerHello {
                challenge,
                host,
                server_sign_pub: state.options.server_keys.public_key,
                app_version: state.options.app_version.clone(),
                min_client: state.options.min_client.clone(),
                protocols: vec![1],
            },
            &state.options.server_keys.secret_key,
        )?;

        return Ok(response(
            200,
            "application/json",
            format!("{{\"hello\":\"{}\"}}", text(&encode(&hello)?)),
        ));
    }
    let _ = route;

    Err(EnvdenError::new(ErrorCode::NotFound, "Unknown route"))
}
