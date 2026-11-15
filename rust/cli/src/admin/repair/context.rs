use crate::{
    adapters::IAdapters,
    admin::shared::context::{IAdminContext, admin_context},
    client::{ITransport, binary},
    state::files::failure,
    vault::history::IVaultHistory,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::{collections::BTreeMap, fs, path::Path, rc::Rc};

pub fn repair_context<'a>(
    adapters: &'a IAdapters,
    token: &str,
    transport: Rc<dyn ITransport>,
) -> Result<(IAdminContext<'a>, [u8; 32])> {
    let token = p::decode_token(p::TTokenKind::Repair, token)?;
    let mut context = admin_context(adapters, transport)?;
    if context.client.options.pin != token.1 {
        return Err(invalid(
            ErrorCode::InvalidInput,
            "Repair token is for another server",
        ));
    }
    let id = p::h("repair-id", &token.0);
    let stored = stored_history(&context)?;
    if c::is_reused_repair_token(&id, &stored.state.repair_ids) {
        return Err(invalid(
            ErrorCode::InvalidData,
            "Repair token was already used",
        ));
    }
    context.client.options.proof = Some(Rc::new(move |r| {
        p::token_proof(
            p::TTokenKind::Repair,
            &p::token_key(p::TTokenKind::Repair, &token.0),
            r,
        )
        .map(|v| v.to_vec())
    }));
    Ok((context, id))
}

pub(super) fn stored_history(context: &IAdminContext<'_>) -> Result<IVaultHistory> {
    let decode = |key: &str| -> Result<Vec<Vec<u8>>> {
        context.local[key]
            .as_array()
            .into_iter()
            .flatten()
            .map(|v| binary(v.as_str().unwrap_or_default()))
            .collect()
    };
    let entries = decode("entries")?
        .iter()
        .map(|b| p::decode(b))
        .collect::<Result<Vec<p::ISigned<p::TEntry>>>>()?;
    let headers = decode("headers")?
        .iter()
        .map(|b| p::decode(b))
        .collect::<Result<Vec<p::ISigned<p::IManifestHeader>>>>()?;
    let state = match c::verify_chain(&entries)? {
        c::TDeviceListResult::Valid { state } => *state,
        _ => {
            return Err(invalid(
                ErrorCode::InvalidData,
                "Repair token was already used",
            ));
        }
    };
    Ok(IVaultHistory {
        entries,
        headers,
        state,
        states: BTreeMap::new(),
    })
}

pub fn cached_bytes(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(b) => Ok(Some(b)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(failure(e)),
    }
}

pub(super) fn invalid(code: ErrorCode, message: &'static str) -> EnvdenError {
    EnvdenError::new(code, message)
}
