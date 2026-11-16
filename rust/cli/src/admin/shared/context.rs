use crate::{
    adapters::IAdapters,
    client::{IClient, ITransport},
    identity::IDeviceIdentity,
    state::{NOT_SET_UP, repository::load_state},
    vault::vault_connection,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
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
    let local = load_state(&adapters.home)?
        .filter(|s| s["server"].is_object() && s["vaultId"].is_string())
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, NOT_SET_UP))?;
    let connection = vault_connection(adapters, &local, transport)?;
    Ok(IAdminContext {
        adapters,
        local,
        identity: connection.identity,
        vault_id: connection.vault_id,
        client: connection.client,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters, client::UreqTransport, client::text, state::empty_state,
        state::repository::save_state,
    };

    #[test]
    fn pending_creation_allows_admin_context() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let mut state = empty_state("test");
        state["vaultId"] = envden_protocol::protocol::base32(&[1; 32]).into();
        state["server"] =
            serde_json::json!({"address":"https://server.test","pin":text(&[2;32]),"protocol":1});
        state["creationPending"] = "pending".into();
        save_state(&adapters.home, &state, &|| 42).unwrap();
        assert!(admin_context(&adapters, Rc::new(UreqTransport)).is_ok());
    }
}
