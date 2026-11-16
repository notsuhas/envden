use crate::{
    adapters::IAdapters,
    admin::shared::{context::IAdminContext, history::check_floor},
    client::retry_head,
    onboarding::vault::add_swap::add_swap,
    state::lock::with_state_lock,
    vault::{
        admin::material::current_material,
        history::{IVaultHistory, read_history},
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
pub(super) struct IChannelKeys {
    pub receive: [u8; 32],
    pub send: [u8; 32],
}

pub(crate) fn named_for_list(
    mut candidate: p::IDeviceRecord,
    history: &IVaultHistory,
) -> p::IDeviceRecord {
    candidate.name = crate::identity::name::unique_device_name(
        &candidate.name,
        history.state.devices.values().map(|v| v.name.as_str()),
    );
    candidate
}

pub(super) fn approve<'a>(
    adapters: &IAdapters,
    number: u32,
    expiry: u64,
    candidate: &p::IDeviceRecord,
    send: &[u8; 32],
    mut context: impl FnMut() -> Result<IAdminContext<'a>>,
) -> Result<String> {
    with_state_lock(&adapters.home, &adapters.now, || {
        retry_head(|| {
            let context = context()?;
            let history = read_history(&context.client, &context.vault_id, None)?;
            check_floor(&context.local, &history)?;
            let material = current_material(&context, &history)?;
            super::exchange::require_window(expiry, (adapters.now)())?;
            let committed = named_for_list(candidate.clone(), &history);
            let name = committed.name.clone();
            let mut swap = add_swap(
                &history,
                committed,
                (context.identity.record.id, &context.identity.keys.obj_sk),
                &material.key,
                2,
                &context.identity,
                (adapters.now)(),
            )?;
            swap.approver = Some(p::seal_pair_approver(
                &p::IPairApprover {
                    vault_id: context.vault_id,
                    server_pin: context.client.options.pin,
                    manifest_hash: p::object_hash(&swap.header, "manifest")?,
                },
                send,
                &p::random_bytes(),
            )?);
            super::persistence::save_approval(adapters, number, &swap)?;
            super::persistence::submit(adapters, &context.client)?;

            Ok(name)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directional_keys_zeroize_on_drop() {
        fn requires_zeroize_on_drop<T: ZeroizeOnDrop>() {}

        requires_zeroize_on_drop::<IChannelKeys>();
        let mut keys = IChannelKeys {
            receive: [7; 32],
            send: [8; 32],
        };
        keys.zeroize();
        assert_eq!(keys.receive, [0; 32]);
        assert_eq!(keys.send, [0; 32]);
    }
}
