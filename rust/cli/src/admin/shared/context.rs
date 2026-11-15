use crate::{
    adapters::IAdapters,
    client::{IClient, ITransport},
    identity::IDeviceIdentity,
    state::{repository::load_state, require_configured},
    vault::vault_connection,
};
use envden_core::errors::Result;
use serde_json::Value;
use std::rc::Rc;

pub struct IAdminContext<'a> {
    pub adapters: &'a IAdapters,
    pub local: Value,
    pub identity: IDeviceIdentity,
    pub vault_id: [u8; 32],
    pub client: IClient,
}

pub fn admin_context(
    adapters: &IAdapters,
    transport: Rc<dyn ITransport>,
) -> Result<IAdminContext<'_>> {
    let local = require_configured(load_state(&adapters.home)?)?;
    let connection = vault_connection(adapters, &local, transport)?;
    Ok(IAdminContext {
        adapters,
        local,
        identity: connection.identity,
        vault_id: connection.vault_id,
        client: connection.client,
    })
}
