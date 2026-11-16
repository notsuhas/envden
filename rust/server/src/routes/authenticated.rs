use crate::{
    http::{encoding::input, errors::response, types::IAppOptions},
    middleware::IAuth,
};
use axum::{
    body::Body,
    http::{Request, Response},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(crate) fn dispatch_authenticated(
    options: &IAppOptions,
    auth: &IAuth,
    request: &Request<Body>,
    body: &[u8],
    receipt: Option<&str>,
) -> Result<Response<Body>> {
    let path = request.uri().path();
    if path.starts_with("/v1/opaque/") {
        let raw: Value = serde_json::from_slice(body)
            .map_err(|_| EnvdenError::new(ErrorCode::InvalidInput, "Invalid JSON"))?;
        let message = raw["message"]
            .as_str()
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Invalid message"))?;
        let purpose = raw["purpose"].as_str().unwrap_or("");
        let value = match path {
            "/v1/opaque/registration/start" => {
                let _: envden_protocol::protocol::IRegistrationStart =
                    crate::http::encoding::json_input(&raw)?;
                crate::auth::start_registration(options, auth, message, receipt)?
            }
            "/v1/opaque/registration/finish" => {
                let _: envden_protocol::protocol::IRegistrationFinish =
                    crate::http::encoding::json_input(&raw)?;
                crate::auth::finish_registration(options, auth, message)?
            }
            "/v1/opaque/login/start" | "/v1/opaque/login/finish" => {
                if !matches!(purpose, "unlock" | "kit") {
                    return Err(EnvdenError::new(
                        ErrorCode::InvalidInput,
                        "Invalid login purpose",
                    ));
                }
                if path.ends_with("start") {
                    let _: envden_protocol::protocol::ILoginStart =
                        crate::http::encoding::json_input(&raw)?;
                } else {
                    let _: envden_protocol::protocol::ILoginFinish =
                        crate::http::encoding::json_input(&raw)?;
                }
                if path.ends_with("start") {
                    crate::auth::start_login(options, auth, purpose, message, receipt)?
                } else {
                    crate::auth::finish_login(options, auth, purpose, message)?
                }
            }
            _ => return Err(EnvdenError::new(ErrorCode::NotFound, "Unknown route")),
        };

        return Ok(response(200, "application/json", value.to_string()));
    }

    if let Some(value) =
        crate::moving::move_route(options, auth, path, request.method().as_str(), body)?
    {
        return Ok(response(200, "application/json", value.to_string()));
    }
    if let Some(result) = crate::repair::recovery_route(options, auth, path, body)? {
        return Ok(result);
    }
    if let Some(value) =
        crate::pairing::pairing(options, auth, path, request.method().as_str(), body)?
    {
        return Ok(response(200, "application/json", value.to_string()));
    }
    if let Some(result) =
        super::settings::settings(options, auth, path, request.method().as_str(), body)?
    {
        return Ok(result);
    }
    if matches!(path, "/v1/vault" | "/v1/swap") {
        let swap = input(|| envden_protocol::protocol::decode(body))?;
        let digest = envden_protocol::protocol::h("swap", body);
        let result = if path == "/v1/vault" {
            crate::vault::create_vault(options, auth, &swap, &digest)?
        } else {
            let query = super::query::query_parameters(request.uri());
            crate::vault::commit_swap(
                options,
                auth,
                &swap,
                &digest,
                query.get("mailbox").and_then(|v| v.parse().ok()),
            )?
        };
        if let envden_core::adapters::storage::TCommitResult::HeadMoved { head } = result {
            return Ok(response(409,"application/json",serde_json::json!({"kind":"head-moved","head":head.map(|v|crate::http::encoding::text(&v))}).to_string()));
        }
        let value = match result {
            envden_core::adapters::storage::TCommitResult::Committed => "{\"kind\":\"committed\"}",
            _ => "{\"kind\":\"retry-of-committed\"}",
        };
        return Ok(response(200, "application/json", value));
    }
    if let Some(result) = super::reads::reads(options, auth, request, body)? {
        return Ok(result);
    }

    Err(EnvdenError::new(ErrorCode::NotFound, "Unknown route"))
}
