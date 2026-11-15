use crate::{
    auth::{has_proof, require_ticket},
    http::types::IAppOptions,
    middleware::{IAuth, require_gate},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub(crate) fn require_read(
    options: &IAppOptions,
    auth: &IAuth,
    kind: &str,
    hash: Option<&[u8]>,
) -> Result<()> {
    let vault = options
        .storage
        .vault(&auth.request.vault_id)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Unknown vault"))?;
    if vault.restored.is_some() {
        if !has_proof(options, auth, "repair")? {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Repair proof required",
            ));
        }
        if !auth.member {
            return Err(EnvdenError::new(
                ErrorCode::NotMember,
                "Membership required",
            ));
        }
        return Ok(());
    }
    if !vault.active {
        return Err(EnvdenError::new(ErrorCode::Moving, "Vault moving"));
    }
    if !auth.member || has_proof(options, auth, "sk")? {
        if !auth.member {
            require_ticket(options, auth)?;
        }
        if kind == "blob" {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Blob read requires unlock",
            ));
        }
        if matches!(kind, "files" | "keyring") {
            let header = super::vault_chain(options.storage.as_ref(), &auth.request.vault_id)?.0;
            let expected = if kind == "files" {
                header.body.files_hash
            } else {
                header.body.keyring_hash
            };
            if hash != Some(expected.as_slice()) {
                return Err(EnvdenError::new(ErrorCode::Unauthorized, "Head files only"));
            }
        }
        return Ok(());
    }

    require_gate(options, auth, kind == "envelope")
}
