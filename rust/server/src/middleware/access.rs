use super::{IAuth, require_gate};
use crate::{
    auth::{has_proof, require_ticket, session_key},
    http::types::IAppOptions,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub(crate) fn verify_mode(options: &IAppOptions, auth: &IAuth, path: &str) -> Result<()> {
    let vault = options.storage.vault(&auth.request.vault_id)?;
    if vault.as_ref().is_some_and(|v| v.restored.is_some()) {
        if !has_proof(options, auth, "repair")? {
            return Err(EnvdenError::new(ErrorCode::RestoredMode, "Repair required"));
        }
        if ![
            "/v1/repair/",
            "/v1/blobs",
            "/v1/files/",
            "/v1/keyrings/",
            "/v1/opaque/",
        ]
        .iter()
        .any(|prefix| path.starts_with(prefix))
            && !matches!(
                path,
                "/v1/swap" | "/v1/headers" | "/v1/entries" | "/v1/head" | "/v1/envelope"
            )
        {
            return Err(EnvdenError::new(ErrorCode::RestoredMode, "Repair required"));
        }
    }
    if vault.is_some_and(|v| !v.active)
        && !["/v1/move/", "/v1/blobs/", "/v1/opaque/registration/"]
            .iter()
            .any(|prefix| path.starts_with(prefix))
        && path != "/v1/swap"
    {
        return Err(EnvdenError::new(ErrorCode::Moving, "Vault moving"));
    }

    Ok(())
}

pub(crate) fn authorize_body(
    options: &IAppOptions,
    auth: &IAuth,
    path: &str,
    method: &str,
) -> Result<()> {
    crate::pairing::preauthorize(options, auth, path, method)?;
    if !auth.member {
        if path == "/v1/opaque/login/finish"
            && options
                .storage
                .session(
                    &auth.request.vault_id,
                    &session_key(auth, "kit"),
                    (options.now)(),
                )?
                .is_none()
        {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Login expired or consumed",
            ));
        }
        if method == "GET" {
            if matches!(
                path,
                "/v1/head" | "/v1/headers" | "/v1/entries" | "/v1/envelope"
            ) {
                crate::vault::require_read(
                    options,
                    auth,
                    if path.ends_with("envelope") {
                        "envelope"
                    } else {
                        "history"
                    },
                    None,
                )?;
            }
            let parts: Vec<_> = path.split('/').collect();
            if let ["", "v1", kind, hash] = parts.as_slice()
                && matches!(*kind, "files" | "keyrings" | "blobs")
            {
                crate::vault::require_read(
                    options,
                    auth,
                    match *kind {
                        "files" => "files",
                        "keyrings" => "keyring",
                        _ => "blob",
                    },
                    Some(&crate::http::encoding::binary(hash, Some(32))?),
                )?;
            }
        }
    }
    if path.starts_with("/v1/opaque/registration/") {
        return crate::auth::authorize_registration(options, auth);
    }
    if path == "/v1/vault"
        && (options.storage.vault(&auth.request.vault_id)?.is_none() || !auth.member)
        && !has_proof(options, auth, "setup")?
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Setup proof required",
        ));
    }
    if path.starts_with("/v1/move/") {
        if path == "/v1/move/session" && !options.storage.has_vault(&auth.request.vault_id)? {
            if !has_proof(options, auth, "setup")? {
                return Err(EnvdenError::new(
                    ErrorCode::Unauthorized,
                    "Setup proof required",
                ));
            }
        } else if matches!(
            path,
            "/v1/move/freeze" | "/v1/move/unfreeze" | "/v1/move/sk-pub"
        ) || path == "/v1/move/period" && method == "GET"
        {
            require_gate(options, auth, true)?;
        } else {
            crate::moving::require_move(options, auth)?;
        }
    } else if path.starts_with("/v1/repair/") {
        crate::repair::require_repair(options, auth)?;
    } else if path.starts_with("/v1/blobs/") && method == "PUT" {
        let vault = options.storage.vault(&auth.request.vault_id)?;
        if vault.as_ref().is_some_and(|v| v.restored.is_some()) {
            crate::repair::require_repair(options, auth)?;
        } else if vault.is_some_and(|v| !v.active) {
            crate::moving::require_move(options, auth)?;
        } else {
            require_gate(options, auth, false)?;
        }
    } else if !auth.member && path == "/v1/swap" {
        require_ticket(options, auth)?;
    } else if path == "/v1/settings/unlock-period" && method == "PUT"
        || path == "/v1/pairing/mailboxes"
    {
        require_gate(options, auth, true)?;
    }

    Ok(())
}
