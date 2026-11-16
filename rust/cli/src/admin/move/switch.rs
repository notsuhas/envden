use super::super::shared::{context::admin_context, history::check_floor};
use crate::{
    adapters::IAdapters,
    client::{ITransport, create_client, hello, text},
    state::{lock::with_state_lock, repository::save_state},
    vault::history::read_history,
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::rc::Rc;

pub fn switch_server(
    adapters: &IAdapters,
    address: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let mut context = admin_context(adapters, transport.clone())?;
        let server = hello(address, None, &*transport, MIN_SERVER)?;
        let mut options = context.client.options.clone();
        options.address = address.into();
        options.pin = server.pin;
        let client = create_client(options);
        let history = read_history(&client, &context.vault_id, None)?;
        check_floor(&context.local, &history)?;
        let moved = history
            .entries
            .iter()
            .rev()
            .find_map(|e| match &e.body.change {
                p::TEntryPayload::ServerMoved(m) => Some(m),
                _ => None,
            });
        if !moved.is_some_and(|m| m.new_pin == server.pin) || history.state.server_pin != server.pin
        {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "Server has no verified move to this pin",
            ));
        }
        context.local["server"] =
            serde_json::json!({"address":address,"pin":text(&server.pin),"protocol":1});
        save_state(&adapters.home, &context.local, &adapters.now)
    })
}
