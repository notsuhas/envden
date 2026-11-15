use crate::{
    http::{
        encoding::{binary, text},
        errors::response,
        types::IAppOptions,
    },
    middleware::{IAuth, require_gate},
    vault::{ordered_devices, require_read},
};
use axum::{
    body::Body,
    http::{Request, Response},
};
use envden_core::{
    adapters::storage::TStateKind,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::h;
use serde_json::json;

fn found(bytes: Option<Vec<u8>>) -> Result<Response<Body>> {
    let bytes = bytes.ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Object unavailable"))?;

    Ok(response(200, "application/octet-stream", bytes))
}

pub(super) fn reads(
    options: &IAppOptions,
    auth: &IAuth,
    request: &Request<Body>,
    body: &[u8],
) -> Result<Option<Response<Body>>> {
    let path = request.uri().path();
    let id = &auth.request.vault_id;
    let storage = options.storage.as_ref();
    let query: std::collections::HashMap<_, _> =
        url::form_urlencoded::parse(request.uri().query().unwrap_or("").as_bytes())
            .into_owned()
            .collect();
    let result = match path {
        "/v1/head" => {
            require_read(options, auth, "history", None)?;
            let bytes = match storage.head(id)? {
                Some(head) => storage.header(id, &head)?.map(|h| h.bytes),
                None => None,
            };
            found(bytes)?
        }
        "/v1/envelope" => {
            require_read(options, auth, "envelope", None)?;
            found(storage.state(id, TStateKind::Envelope, &[])?)?
        }
        "/v1/headers" | "/v1/entries" => {
            require_read(options, auth, "history", None)?;
            let value = crate::vault::read_range(
                storage,
                id,
                path == "/v1/headers",
                query.get("from").map(String::as_str),
                query.get("to").map(String::as_str),
            )?;
            response(200, "application/json", value.to_string())
        }
        "/v1/blobs" => {
            require_read(options, auth, "blob", None)?;
            response(200,"application/json",json!({"objects":storage.blob_hashes(id)?.iter().map(|v|text(v)).collect::<Vec<_>>()}).to_string())
        }
        "/v1/devices" => {
            require_gate(options, auth, false)?;
            let devices = ordered_devices(&options.storage, id)?
                .iter()
                .map(|d| {
                    let seen = storage
                        .device(id, &d.id)?
                        .map(|s| s.client_version)
                        .filter(|s| !s.is_empty());
                    Ok(json!({"id":text(&d.id),"clientVersion":seen,"confirmed":seen.is_some()}))
                })
                .collect::<Result<Vec<_>>>()?;
            response(
                200,
                "application/json",
                json!({"devices":devices}).to_string(),
            )
        }
        _ => {
            let parts: Vec<_> = path.split('/').collect();
            let ["", "v1", kind, encoded] = parts.as_slice() else {
                return Ok(None);
            };
            if !matches!(*kind, "files" | "keyrings" | "blobs") {
                return Ok(None);
            }
            let hash = binary(encoded, Some(32))?;
            let kind = match *kind {
                "files" => "files",
                "keyrings" => "keyring",
                _ => "blob",
            };
            if request.method() == "PUT" && kind == "blob" {
                let vault = storage
                    .vault(id)?
                    .ok_or_else(|| EnvdenError::new(ErrorCode::Internal, "Vault unavailable"))?;
                if vault.restored.is_some() {
                    crate::repair::require_repair(options, auth)?;
                    if !auth.member {
                        return Err(EnvdenError::new(
                            ErrorCode::NotMember,
                            "Membership required",
                        ));
                    }
                } else if !vault.active {
                    crate::moving::require_move(options, auth)?;
                } else {
                    require_gate(options, auth, false)?;
                }
                if body.is_empty() || body.len() > 16777216 || h("blob", body).as_slice() != hash {
                    return Err(EnvdenError::new(ErrorCode::InvalidInput, "Invalid blob"));
                }
                storage.put_blob(
                    id,
                    &hash,
                    body,
                    Some(&|bytes| h("blob", bytes).to_vec()),
                    Some((options.now)()),
                    None,
                )?;
                response(200, "application/json", "{\"kind\":\"uploaded\"}")
            } else {
                require_read(options, auth, kind, Some(&hash))?;
                found(match kind {
                    "files" => storage.file_list(id, &hash)?,
                    "keyring" => storage.state(id, TStateKind::Keyring, &hash)?,
                    _ => storage.get_blob(id, &hash)?,
                })?
            }
        }
    };

    Ok(Some(result))
}
