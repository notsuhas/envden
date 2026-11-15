use super::{
    assets::asset,
    host::{allowed_host, same_origin},
    token::token_matches,
};
use axum::{
    Router,
    body::Body,
    http::{Request, Response, StatusCode},
    routing::any,
};
use std::sync::Arc;

pub const SECURITY_HEADERS: &[(&str, &str)] = &[
    (
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    ),
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Cross-Origin-Opener-Policy", "same-origin"),
    ("Cross-Origin-Resource-Policy", "same-origin"),
    ("Cache-Control", "no-store"),
];

pub type TApi = Arc<dyn Fn(&str) -> envden_core::errors::Result<serde_json::Value> + Send + Sync>;

pub struct IApiRequest {
    pub method: String,
    pub path: String,
    pub query: String,
    pub body: serde_json::Value,
}

pub type TRequestApi = Arc<
    dyn Fn(&IApiRequest) -> envden_core::errors::Result<Option<serde_json::Value>> + Send + Sync,
>;

pub fn create_dashboard_app(port: u16, token: String, api: TApi) -> Router {
    create_request_dashboard_app(
        port,
        token,
        Arc::new(move |request| api(&request.path).map(Some)),
    )
}

pub fn create_request_dashboard_app(port: u16, token: String, api: TRequestApi) -> Router {
    Router::new().fallback(any(move |request: Request<Body>| {
        let token = token.clone();
        let api = api.clone();
        async move {
            let (parts, body) = request.into_parts();
            let bytes = axum::body::to_bytes(body, usize::MAX)
                .await
                .unwrap_or_default();
            let input = IApiRequest {
                method: parts.method.to_string(),
                path: parts.uri.path().into(),
                query: parts.uri.query().unwrap_or_default().into(),
                body: serde_json::from_slice(&bytes).unwrap_or_default(),
            };
            let request = Request::from_parts(parts, Body::empty());
            let mut response = respond(&request, port, &token, api, &input);
            for (name, value) in SECURITY_HEADERS {
                response.headers_mut().insert(
                    axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
                    axum::http::HeaderValue::from_static(value),
                );
            }
            response
        }
    }))
}

fn json(status: u16, body: serde_json::Value) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn error(status: u16, code: &str, message: &str) -> Response<Body> {
    json(status, serde_json::json!({"error":code,"message":message}))
}

fn respond(
    request: &Request<Body>,
    port: u16,
    token: &str,
    api: TRequestApi,
    input: &IApiRequest,
) -> Response<Body> {
    let header = |name| request.headers().get(name).and_then(|v| v.to_str().ok());
    if !allowed_host(header("Host"), port) {
        return error(421, "INVALID_INPUT", "Unexpected host");
    }
    let path = request.uri().path();
    if path.starts_with("/api/") {
        if !token_matches(header("Authorization"), token) {
            return error(401, "UNAUTHORIZED", "Open the link envden ui printed");
        }
        if request.method() != "GET" && !same_origin(header("Origin"), header("Host")) {
            return error(403, "UNAUTHORIZED", "Cross-origin request refused");
        }
        match api(input) {
            Ok(Some(value)) => return json(200, value),
            Ok(None) => {}
            Err(e) => {
                return error(
                    super::errors::error_status(e.code),
                    e.code.as_str(),
                    &e.message,
                );
            }
        }
    }
    if request.method() == "GET"
        && let Some((content_type, body)) = asset(path)
    {
        return Response::builder()
            .header("Content-Type", content_type)
            .body(Body::from(body))
            .unwrap();
    }
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/plain; charset=UTF-8")
        .body(Body::from("404 Not Found"))
        .unwrap()
}
