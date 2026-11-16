use super::{TPassword, login};
use crate::{
    adapters::IAdapters,
    client::{IClientOptions, ITransport, binary, create_client},
    identity::device_identity,
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
        require_configured,
    },
    version::VERSION,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::rc::Rc;

pub fn unlock_device(
    adapters: &IAdapters,
    password: TPassword<'_>,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    let state = require_configured(load_state(&adapters.home)?)?;
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        state["deviceName"].as_str().unwrap_or_default(),
        false,
        (adapters.now)(),
    )?;
    let read = |value: &serde_json::Value| {
        value
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state"))
    };
    let vault_id = p::fixed(&p::unbase32(&read(&state["vaultId"])?)?)?;
    let client = create_client(IClientOptions {
        address: read(&state["server"]["address"])?,
        pin: p::fixed(&binary(&read(&state["server"]["pin"])?)?)?,
        vault_id,
        record: identity.record,
        req_sk: identity.keys.req_sk,
        version: VERSION.into(),
        now: std::rc::Rc::new(adapters.now),
        transport,
        proof: None,
        unlock: None,
        backoff: Rc::new(crate::time::wait),
    });
    let Some(session) = login(&client, &vault_id, password, p::TLoginPurpose::Unlock)? else {
        return Ok(());
    };
    with_state_lock(&adapters.home, (adapters.now)(), || {
        let mut current = require_configured(load_state(&adapters.home)?)?;
        current["session"] = serde_json::to_value(session).expect("serializable window");
        save_state(&adapters.home, &current, (adapters.now)())
    })
}
