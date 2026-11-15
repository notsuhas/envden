use super::{exchange::put, exchange::wait, local::prepare};
use crate::{
    adapters::IAdapters,
    client::{UreqTransport, binary},
    onboarding::vault::add_swap::add_swap,
    output::{
        prompts::{consent, secret},
        sanitize_terminal,
    },
    session::{TPassword, login},
    state::{
        repository::{load_state, save_state},
        require_configured,
    },
    vault::{checkpoint_material, history::read_history, vault_connection},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::rc::Rc;

pub fn add(adapters: &IAdapters) -> Result<()> {
    let mut state = require_configured(load_state(&adapters.home)?)?;
    let connection = vault_connection(adapters, &state, Rc::new(UreqTransport))?;
    let client = &connection.client;
    let password = secret("Master password", |_| None)?;
    if let Some(session) = login(
        client,
        &connection.vault_id,
        TPassword::Fixed(&password),
        p::TLoginPurpose::Unlock,
    )? {
        state["session"] = serde_json::to_value(session).expect("window");
        save_state(&adapters.home, &state, (adapters.now)())?;
    }
    if super::persistence::submit(adapters, client)? {
        println!("Device added");
        return Ok(());
    }
    let mailbox = client
        .request("/v1/pairing/mailboxes", "POST", None)?
        .json()?;
    let number = mailbox["number"]
        .as_u64()
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Invalid pairing response"))?
        as u32;
    let expiry = mailbox["expiresAt"]
        .as_u64()
        .unwrap_or(0)
        .min((adapters.now)() + 600_000);
    let pin = client.options.pin;
    let attempt = prepare(&pin, number)?;
    println!(
        "{}",
        sanitize_terminal(&format!(
            "On the new device run: envden join {}\nand enter code {} (valid 10 minutes). Keep this running.",
            client.options.address, attempt.code
        ))
    );
    let ke1 = wait(
        client,
        &format!("/v1/pairing/mailboxes/{number}/KE1"),
        adapters.now,
        expiry,
    )?;
    let identifiers = p::pairing_identifiers(&pin, number)?;
    let response = p::opaque_server_start_login(p::IStartServerLoginParams {
        server_setup: attempt.setup,
        registration_record: Some(attempt.record),
        start_login_request: ke1,
        user_identifier: identifiers.user_identifier,
        identifiers: Some(identifiers.identifiers),
    })?;
    put(client, number, "KE2", &response.login_response)?;
    let ke3 = wait(
        client,
        &format!("/v1/pairing/mailboxes/{number}/KE3"),
        adapters.now,
        expiry,
    )?;
    let finish = p::opaque_server_finish_login(p::IFinishServerLoginParams {
        server_login_state: response.server_login_state,
        finish_login_request: ke3,
        identifiers: Some(p::pairing_identifiers(&pin, number)?.identifiers),
    })?;
    let (receive, send) = p::pairing_channel_keys(&binary(&finish.session_key)?)?;
    let message = wait(
        client,
        &format!("/v1/pairing/mailboxes/{number}/PairJoiner"),
        adapters.now,
        expiry,
    )?;
    let candidate = p::open_pair_joiner(&binary(&message)?, &receive)?.device;
    if !consent(&format!("Add {}?", candidate.name), false)? {
        client.request(&format!("/v1/pairing/mailboxes/{number}"), "DELETE", None)?;
        println!("Declined");
        return Ok(());
    }
    let history = read_history(client, &connection.vault_id, None)?;
    let material = checkpoint_material(adapters, &state)?;
    let epoch = &material.keys[&history.state.epoch];
    let name = candidate.name.clone();
    let mut swap = add_swap(
        &history,
        candidate,
        (connection.identity.record.id, &connection.identity.keys.obj_sk),
        epoch,
        2,
        &connection.identity,
        (adapters.now)(),
    )?;
    swap.approver = Some(p::seal_pair_approver(
        &p::IPairApprover {
            vault_id: connection.vault_id,
            server_pin: pin,
            manifest_hash: p::object_hash(&swap.header, "manifest")?,
        },
        &send,
        &p::random_bytes(),
    )?);
    super::persistence::save_approval(adapters, number, &swap)?;
    super::persistence::submit(adapters, client)?;
    println!("{}", sanitize_terminal(&format!("Device {name} added")));
    Ok(())
}
