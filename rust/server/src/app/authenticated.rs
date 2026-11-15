use super::types::AppState;
use crate::http::{encoding::text, policy::request_route};
use axum::{body::Body, extract::Request, http::Response};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub(super) async fn authenticated(state: &AppState, request: Request) -> Result<Response<Body>> {
    use crate::{
        middleware::{
            authorize_body,
            body::{declared_body_size, read_body},
            budget::TBudget,
            verify_headers, verify_mode,
        },
        routes::dispatch_authenticated,
    };
    let (parts, body) = request.into_parts();
    let path = parts.uri.path();
    let (auth, route, reservation, receipt, capacity) = {
        let _guard = state.options.storage_lock.lock().expect("storage lock");
        let has_body = parts.headers.contains_key("transfer-encoding")
            || parts
                .headers
                .get("content-length")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .is_some_and(|v| v > 0);
        let route = request_route(parts.method.as_str(), path, has_body)?;
        let auth = verify_headers(&state.options, &parts.method, &parts.uri, &parts.headers)?;
        let storage = state.options.storage.as_ref();
        if !storage.has_vault(&auth.request.vault_id)?
            && path != "/v1/vault"
            && path != "/v1/move/session"
            && !matches!(
                route.policy,
                Some(
                    crate::http::policy::TPolicy::Registration
                        | crate::http::policy::TPolicy::Mailbox
                        | crate::http::policy::TPolicy::Approver
                )
            )
        {
            return Err(EnvdenError::new(ErrorCode::NotFound, "Unknown vault"));
        }
        if !auth.member && route.policy.is_none() {
            return Err(EnvdenError::new(
                ErrorCode::NotMember,
                "Membership required",
            ));
        }
        verify_mode(&state.options, &auth, path)?;
        authorize_body(&state.options, &auth, path, parts.method.as_str())?;
        let receipt = if !auth.member && route.charge {
            Some(crate::auth::charge(&state.options, &auth)?)
        } else {
            None
        };
        if !storage.remember_nonce(
            &auth.request.device,
            &auth.request.nonce,
            (state.options.now)(),
        )? {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Replayed request",
            ));
        }
        let capacity = declared_body_size(&parts.headers, route.limit)?;
        let budget = if auth.member {
            TBudget::Member
        } else if matches!(
            route.policy,
            Some(crate::http::policy::TPolicy::Data | crate::http::policy::TPolicy::Registration)
        ) {
            TBudget::Authorized
        } else {
            TBudget::Public
        };
        let reservation = state.budget.reserve(
            if has_body { capacity * 2 } else { 0 },
            budget,
            Some((
                text(&auth.request.vault_id),
                format!(
                    "{}:{}",
                    text(&auth.request.vault_id),
                    text(&auth.request.device)
                ),
            )),
        )?;
        (auth, route, reservation, receipt, capacity)
    };
    let bytes = read_body(body, capacity, &auth.request.body_hash).await?;
    let request = Request::from_parts(parts, Body::empty());
    let _guard = state.options.storage_lock.lock().expect("storage lock");
    let _reservation = reservation;
    let _ = route;
    if auth.member
        && crate::vault::membership(
            &state.options.storage,
            &auth.request.vault_id,
            &auth.request.device,
        )?
        .is_none()
    {
        return Err(EnvdenError::new(
            ErrorCode::NotMember,
            "Membership required",
        ));
    }

    dispatch_authenticated(&state.options, &auth, &request, &bytes, receipt.as_deref())
}
