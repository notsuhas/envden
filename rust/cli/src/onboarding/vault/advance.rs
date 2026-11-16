use crate::{
    adapters::IAdapters,
    client::{IClient, create_client},
    identity::IDeviceIdentity,
    session::record_unlock_window,
    sync::remote::{
        accept::accept_head,
        context::{ISyncContext, ISyncOptions},
        persist::persist_checkpoint,
    },
    vault::{checkpoint_material, history::IVaultHistory},
};
use envden_core::errors::Result;
use serde_json::Value;

pub(in crate::onboarding) fn advance(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    local: &Value,
    history: &IVaultHistory,
) -> Result<Value> {
    let mut state = local.clone();
    record_unlock_window(client, &mut state)?;
    let material = checkpoint_material(adapters, &state)?;
    let mut context = ISyncContext {
        adapters,
        state,
        identity: identity.clone(),
        client: create_client(client.options.clone()),
        vault_id: client.options.vault_id,
        options: ISyncOptions {
            unlock: None,
            now: std::rc::Rc::new(|| 0),
            cwd: None,
            all: false,
            yes: false,
            interactive: false,
            choose: None,
            confirm: None,
            report: None,
        },
        skipped_roots: Default::default(),
        headers: material.headers,
        entries: material.entries,
        keys: material.keys,
        checkpoint: material.checkpoint,
    };
    let history = IVaultHistory {
        entries: history.entries.clone(),
        headers: history.headers.clone(),
        state: history.state.clone(),
        states: history.states.clone(),
    };
    accept_head(&mut context, Some(history), false)?;
    persist_checkpoint(&mut context)?;
    Ok(context.state)
}
