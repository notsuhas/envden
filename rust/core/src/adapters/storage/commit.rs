use super::{IStorageAdapter, IStoredSwap};
use crate::errors::{EnvdenError, ErrorCode, Result};
pub fn prepare_commit(
    storage: &dyn IStorageAdapter,
    vault: &[u8],
    swap: &IStoredSwap,
    now: u64,
) -> Result<()> {
    if let Some(hash) = &swap.setup_token_hash
        && storage.setup_token()?.as_ref() != Some(hash)
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Setup token changed or consumed",
        ));
    }
    for session in swap.consume_sessions.as_deref().unwrap_or_default() {
        if storage.consume_session(vault, session, now)?.is_none() {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Session expired or consumed",
            ));
        }
    }
    if let Some(number) = swap.close_mailbox
        && storage.mailbox(vault, number, now)?.is_none()
    {
        return Err(EnvdenError::new(
            ErrorCode::NotFound,
            "Mailbox expired or closed",
        ));
    }
    if let Some(state) = &swap.vault {
        storage.configure_vault(vault, state, &[], None)?;
    }
    if !storage.has_vault(vault)? {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Creation requires vault metadata",
        ));
    }
    Ok(())
}
pub fn write_commit_state(
    storage: &dyn IStorageAdapter,
    vault: &[u8],
    swap: &IStoredSwap,
) -> Result<()> {
    storage.write_state(vault, swap.state.as_deref().unwrap_or_default())?;
    for device in swap.devices.as_deref().unwrap_or_default() {
        storage.put_device(vault, &device.id, &device.state)?;
    }
    Ok(())
}
