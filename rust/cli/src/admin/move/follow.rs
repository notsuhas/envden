use crate::{
    adapters::IAdapters,
    admin::shared::history::check_floor,
    client::{IClient, create_client, hello, text},
    state::repository::save_state,
    vault::history::{IVaultHistory, read_history},
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};

pub type TMoveUnlock<'a> = dyn Fn(&IClient, &[u8; 32]) -> Result<()> + 'a;

pub fn follow_server_move(
    adapters: &IAdapters,
    local: &mut Value,
    client: &IClient,
    history: &IVaultHistory,
    unlock: Option<&TMoveUnlock<'_>>,
) -> Result<Option<IClient>> {
    check_floor(local, history)?;
    let Some(moved) = history
        .entries
        .iter()
        .rev()
        .find(|e| matches!(e.body.change, p::TEntryPayload::ServerMoved(_)))
    else {
        return Ok(None);
    };
    let p::TEntryPayload::ServerMoved(target) = &moved.body.change else {
        unreachable!()
    };
    if local["server"]["pin"] == text(&target.new_pin) {
        return Ok(None);
    }
    let hash = p::object_hash(moved, "entry")?;
    let header = history
        .headers
        .iter()
        .find(|h| h.body.list_head == hash)
        .filter(|h| h.body.op == 10)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Move header missing"))?;
    hello(
        &target.new_address,
        Some(&target.new_pin),
        &*client.options.transport,
        MIN_SERVER,
    )?;
    let mut options = client.options.clone();
    options.address = target.new_address.clone();
    options.pin = target.new_pin;
    options.unlock = None;
    let destination = create_client(options);
    let swap = p::ISwap {
        expected_head: header.body.prev,
        header: header.clone(),
        entries: vec![moved.clone()],
        files: None,
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    };
    destination.request_bytes("/v1/swap", "POST", &p::encode(&swap)?)?;
    if let Some(unlock) = unlock {
        unlock(&destination, &client.options.vault_id)?;
    }
    let next = read_history(&destination, &client.options.vault_id, None)?;
    let mut floor = local.clone();
    floor["headers"] = Value::Array(
        history
            .headers
            .iter()
            .map(|h| p::encode(h).map(|b| text(&b).into()))
            .collect::<Result<_>>()?,
    );
    check_floor(&floor, &next)?;
    if next.state.server_pin != target.new_pin {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Destination pin does not match the move",
        ));
    }
    local["server"] =
        json!({"address":target.new_address,"pin":text(&target.new_pin),"protocol":1});
    save_state(&adapters.home, local, (client.options.now)())?;
    Ok(Some(destination))
}
