use super::{
    commit::{commit, entry, finish_swap},
    material::next_epoch,
};
use crate::{
    adapters::IAdapters,
    admin::shared::{context::admin_context, history::current_history, swap::admin_swap},
    client::{ITransport, retry_head},
    session::{TPassword, login},
    state::lock::with_state_lock,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;
use std::rc::Rc;

use super::devices::recovery_holders;

pub fn remove(
    adapters: &IAdapters,
    name: &str,
    new_kit: bool,
    transport: Rc<dyn ITransport>,
    show: &mut dyn FnMut(&Value) -> Result<()>,
) -> Result<bool> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        retry_head(|| {
            let context = admin_context(adapters, transport.clone())?;
            let finished = super::pending::settle(&context)?;
            let history = current_history(&context)?;
            let device = history
                .state
                .devices
                .values()
                .find(|d| d.name == name || p::base32(&d.id) == name);
            if finished && device.is_none() {
                return Ok(true);
            }
            let device =
                device.ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Device not found"))?;
            if device.id == context.identity.record.id || history.state.devices.len() == 1 {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Cannot remove this device or the last device",
                ));
            }
            let password = crate::output::prompts::secret("Master password", |_| None)?;
            login(
                &context.client,
                &context.vault_id,
                TPassword::Fixed(&password),
                p::TLoginPurpose::Unlock,
            )?;
            let exposure = super::exposure::exposed_names(&context, &history)?;
            crate::output::print(&super::exposure::exposure_text(&exposure));
            if !crate::output::prompts::consent("Remove this device?", false)? {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidInput,
                    "Device removal cancelled",
                ));
            }
            let replace = new_kit
                || (recovery_holders(&history).contains(&device.id)
                    && crate::output::prompts::consent(
                        "This device held recovery keys. Replace the recovery kit in this removal?",
                        false,
                    )?);
            if replace {
                super::credentials::replace(
                    adapters,
                    &password,
                    transport.clone(),
                    Some(device.id),
                    show,
                )?;
            } else {
                let (change, keyring) =
                    next_epoch(&context, &history, &history.state.recovery, Some(device.id))?;
                let entry = entry(
                    &context,
                    &history,
                    p::TEntryPayload::RemoveDevice(p::IRemoveDevice {
                        device: device.id,
                        new_recovery: None,
                        change,
                    }),
                )?;
                commit(
                    &context,
                    &finish_swap(
                        admin_swap(
                            &history,
                            &context.identity,
                            4,
                            (adapters.now)(),
                            vec![entry],
                        )?,
                        &context,
                        Some(keyring),
                        None,
                    )?,
                )?;
            }
            Ok(false)
        })
    })
}
