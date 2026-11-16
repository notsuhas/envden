use super::super::shared::{
    context::{IAdminContext, admin_context},
    history::check_floor,
};
use crate::{
    adapters::IAdapters,
    client::{IClient, ITransport, create_client, hello, text},
    state::{lock::with_state_lock, repository::save_state},
    vault::history::read_history,
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::rc::Rc;

pub type TUnlock<'a> = &'a dyn Fn(&IClient, &[u8; 32]) -> Result<Option<p::IUnlockWindow>>;

// The destination keeps its own unlock sessions, so a locked device logs in there, never at the old address.
pub fn switch_server(
    adapters: &IAdapters,
    address: &str,
    transport: Rc<dyn ITransport>,
    unlock: Option<TUnlock<'_>>,
) -> Result<()> {
    let attempt = |session: Option<p::IUnlockWindow>| {
        with_state_lock(&adapters.home, &adapters.now, || {
            locked_switch(adapters, address, transport.clone(), session.clone())
        })
    };

    let unlock = match (attempt(None), unlock) {
        (Err(error), Some(unlock)) if error.code == ErrorCode::Locked => unlock,
        (result, _) => return result,
    };

    // The password prompt runs outside the state lock so it never blocks other commands.
    let (context, client, _) = destination(adapters, address, transport.clone())?;
    let session = unlock(&client, &context.vault_id)?;

    attempt(session)
}

fn destination<'a>(
    adapters: &'a IAdapters,
    address: &str,
    transport: Rc<dyn ITransport>,
) -> Result<(IAdminContext<'a>, IClient, [u8; 32])> {
    let context = admin_context(adapters, transport.clone())?;
    let server = hello(address, None, &*transport, MIN_SERVER)?;
    let mut options = context.client.options.clone();
    options.address = address.into();
    options.pin = server.pin;

    Ok((context, create_client(options), server.pin))
}

fn locked_switch(
    adapters: &IAdapters,
    address: &str,
    transport: Rc<dyn ITransport>,
    session: Option<p::IUnlockWindow>,
) -> Result<()> {
    let (mut context, client, pin) = destination(adapters, address, transport)?;
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
    if !moved.is_some_and(|m| m.new_pin == pin) || history.state.server_pin != pin {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Server has no verified move to this pin",
        ));
    }
    context.local["server"] = serde_json::json!({"address":address,"pin":text(&pin),"protocol":1});
    if let Some(session) = session {
        context.local["session"] = serde_json::to_value(session).expect("serializable window");
    }

    save_state(&adapters.home, &context.local, &adapters.now)
}

#[cfg(test)]
#[path = "tests/switch.rs"]
mod tests;
