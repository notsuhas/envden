use crate::{
    admin::shared::{context::IAdminContext, history::current_history},
    client::{binary, create_client},
    state::files::{failure, optional_read},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::{fs, path::Path};

pub fn abort_move(
    context: &IAdminContext<'_>,
    directory: &Path,
    address: Option<&str>,
) -> Result<()> {
    crate::state::lock::with_state_lock(&context.adapters.home, &context.adapters.now, || {
        locked_abort_move(context, directory, address)
    })
}

fn locked_abort_move(
    context: &IAdminContext<'_>,
    directory: &Path,
    address: Option<&str>,
) -> Result<()> {
    let history = current_history(context)?;
    let stored = binary(context.local["server"]["pin"].as_str().unwrap_or(""))?;
    if history.state.server_pin.as_slice() != stored {
        return Err(EnvdenError::new(
            ErrorCode::Moving,
            "Move already committed; resume it instead",
        ));
    }
    if let Some(address) = address.filter(|s| !s.is_empty()) {
        let saved_pin = optional_read(&directory.join("move-pin"))?
            .filter(|pin| !pin.is_empty())
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing move pin"))?;
        let mut options = context.client.options.clone();
        options.address = address.into();
        options.pin = p::fixed(&binary(&saved_pin)?)?;
        match create_client(options).request("/v1/move/discard", "POST", None) {
            Err(e) if e.code != ErrorCode::NotFound => return Err(e),
            _ => {}
        }
    }
    context.client.request("/v1/move/unfreeze", "POST", None)?;
    for file in ["move-address", "move-swap.bin", "move-pin"] {
        remove(&directory.join(file))?;
    }
    context.adapters.keychain.delete(&format!(
        "envden/{}/move-token",
        context.adapters.home.display()
    ))
}

pub fn remove(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(failure(e)),
    }
}
