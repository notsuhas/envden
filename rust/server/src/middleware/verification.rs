use crate::{
    http::{
        encoding::{binary, input},
        types::IAppOptions,
    },
    vault::membership,
};
use axum::http::{HeaderMap, Method, Uri};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::*;

pub(crate) struct IAuth {
    pub request: IRequest,
    pub member: bool,
    pub proof: Option<Vec<u8>>,
}

pub(crate) fn verify_headers(
    options: &IAppOptions,
    method: &Method,
    uri: &Uri,
    headers: &HeaderMap,
) -> Result<IAuth> {
    let header = |key| headers.get(key).and_then(|v| v.to_str().ok()).unwrap_or("");
    let request: IRequest = input(|| decode(&binary(header("envden-request"), None)?))?;
    let signature = binary(header("envden-signature"), Some(64))?;
    let bad = || EnvdenError::new(ErrorCode::Unauthorized, "Request binding mismatch");
    if request.device.as_slice() != binary(header("envden-device"), Some(16))?
        || request.time.to_string() != header("envden-time")
        || request.nonce.as_slice() != binary(header("envden-nonce"), Some(16))?
        || request.method != method.as_str()
        || request.path_and_query != uri.path_and_query().map_or("/", |v| v.as_str())
        || request.body_hash.as_slice() != binary(header("envden-body-hash"), Some(32))?
    {
        return Err(bad());
    }
    let member = membership(&options.storage, &request.vault_id, &request.device)?;
    let supplied = match &member {
        Some(record) => record.clone(),
        None => input(|| decode::<IDeviceRecord>(&binary(header("envden-device-record"), None)?))?,
    };
    if supplied.id != request.device
        || !matches!(
            verify_request_hash(
                &ISigned {
                    body: request.clone(),
                    signature
                },
                &supplied.req_pub,
                &server_pin(&options.server_keys.public_key)?,
                &request.body_hash,
                (options.now)(),
                false
            ),
            TVerification::Valid(_)
        )
    {
        return Err(EnvdenError::new(ErrorCode::Unauthorized, "Invalid request"));
    }
    if compare_semver(&request.client_version, &options.min_client)?.is_lt() {
        return Err(EnvdenError::new(ErrorCode::ClientTooOld, "Update required"));
    }
    let proof = if header("envden-proof").is_empty() {
        None
    } else {
        Some(binary(header("envden-proof"), None)?)
    };
    if member.is_some() {
        let state = options.storage.device(&request.vault_id, &request.device)?;
        if state
            .as_ref()
            .is_none_or(|state| state.client_version != request.client_version)
        {
            let mut state = state.unwrap_or_default();
            state.client_version = request.client_version.clone();
            options
                .storage
                .put_device(&request.vault_id, &request.device, &state)?;
        }
    }

    Ok(IAuth {
        request,
        member: member.is_some(),
        proof,
    })
}
