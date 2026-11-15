use crate::{
    adapters::IAdapters,
    client::{IClient, IClientOptions, ITransport, binary, create_client},
    identity::{IDeviceIdentity, device_identity},
    version::VERSION,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::Value;
use std::rc::Rc;

type TVaultUnlock = Rc<dyn Fn(&IClient, &[u8; 32]) -> Result<()>>;

pub struct IVaultConnection {
    pub identity: IDeviceIdentity,
    pub vault_id: [u8; 32],
    pub client: IClient,
}

pub fn vault_connection(
    adapters: &IAdapters,
    state: &Value,
    transport: Rc<dyn ITransport>,
) -> Result<IVaultConnection> {
    let read = |v: &Value| {
        v.as_str()
            .map(str::to_owned)
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state"))
    };
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        &read(&state["deviceName"])?,
        false,
        (adapters.now)(),
    )?;
    let vault_id = p::fixed(&p::unbase32(&read(&state["vaultId"])?)?)?;
    let client = create_client(IClientOptions {
        address: read(&state["server"]["address"])?,
        pin: p::fixed(&binary(&read(&state["server"]["pin"])?)?)?,
        vault_id,
        record: identity.record.clone(),
        req_sk: identity.keys.req_sk,
        version: VERSION.into(),
        now: adapters.now,
        transport,
        proof: None,
        unlock: None,
        backoff: Rc::new(|ms| std::thread::sleep(std::time::Duration::from_millis(ms))),
    });
    Ok(IVaultConnection {
        identity,
        vault_id,
        client,
    })
}

impl IVaultConnection {
    pub fn with_unlock(mut self, unlock: TVaultUnlock) -> Self {
        let options = self.client.options.clone();
        let vault = self.vault_id;
        self.client.options.unlock = Some(Rc::new(move || {
            unlock(&create_client(options.clone()), &vault)
        }));
        self
    }
}
