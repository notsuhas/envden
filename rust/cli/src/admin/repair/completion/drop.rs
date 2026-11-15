use super::super::context::invalid;
use crate::{
    admin::shared::{context::IAdminContext, swap::admin_swap},
    vault::{
        admin::{
            commit::{entry, finish_swap},
            material::next_epoch,
        },
        history::IVaultHistory,
    },
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::protocol as p;

pub fn drop_devices(
    context: &IAdminContext<'_>,
    mut history: IVaultHistory,
    without: &[String],
) -> Result<IVaultHistory> {
    for name in without {
        let Some(device) = history
            .state
            .devices
            .values()
            .find(|d| d.name == *name || p::base32(&d.id) == *name)
        else {
            continue;
        };
        if device.id == context.identity.record.id || history.state.devices.len() == 1 {
            return Err(invalid(
                ErrorCode::InvalidInput,
                "Cannot drop this device or the last device",
            ));
        }
        let (change, keyring) =
            next_epoch(context, &history, &history.state.recovery, Some(device.id))?;
        let entry = entry(
            context,
            &history,
            p::TEntryPayload::RemoveDevice(p::IRemoveDevice {
                device: device.id,
                new_recovery: None,
                change,
            }),
        )?;
        let swap = finish_swap(
            admin_swap(
                &history,
                &context.identity,
                4,
                (context.adapters.now)(),
                vec![entry],
            )?,
            context,
            Some(keyring),
            None,
        )?;
        history = crate::admin::shared::submission::submit_admin(context, &swap)?;
    }
    Ok(history)
}
