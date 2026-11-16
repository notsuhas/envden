use super::{
    exchange::{get, put, wait, wait_slot},
    local::prepare,
};
use crate::{
    adapters::IAdapters,
    admin::shared::context::admin_context,
    client::{UreqTransport, binary},
    output::{
        prompts::{consent, secret},
        sanitize_console,
    },
    session::{TPassword, login},
    state::{
        lock::with_state_lock,
        repository::{load_state, save_state},
        require_configured,
    },
    vault::{history::read_history, vault_connection},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::rc::Rc;
use zeroize::Zeroizing;

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
        with_state_lock(&adapters.home, &adapters.now, || {
            state = require_configured(load_state(&adapters.home)?)?;
            state["session"] = serde_json::to_value(session).expect("window");
            save_state(&adapters.home, &state, &adapters.now)
        })?;
    }
    if with_state_lock(&adapters.home, &adapters.now, || {
        super::persistence::resume(adapters, client)
    })? {
        println!("Device added");
        return Ok(());
    }
    let mailbox = client
        .request("/v1/pairing/mailboxes", "POST", None)?
        .json()?;
    let mailbox: p::IMailboxOpened = serde_json::from_value(mailbox).map_err(|cause| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid pairing response", cause)
    })?;
    let number = mailbox.number;
    let pin = client.options.pin;
    let attempt = prepare(&pin, number)?;
    let expiry = announce(
        &client.options.address,
        &attempt.code,
        mailbox.expires_at,
        adapters.now,
        |message| println!("{message}"),
    )?;
    let ke1 = wait_slot(
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
    let finish = finish_login(
        client,
        number,
        &pin,
        response.server_login_state,
        adapters.now,
        expiry,
    )?;
    let session = Zeroizing::new(binary(&finish.session_key)?);
    let (receive, send) = p::pairing_channel_keys(&session)?;
    drop(session);
    let keys = super::approval::IChannelKeys { receive, send };
    let message = wait_slot(
        client,
        &format!("/v1/pairing/mailboxes/{number}/PairJoiner"),
        adapters.now,
        expiry,
    )?;
    let candidate = p::open_pair_joiner(&binary(&message)?, &keys.receive)?.device;
    let history = read_history(client, &connection.vault_id, None)?;
    let name = super::approval::named_for_list(candidate.clone(), &history).name;
    if !consent(&format!("Add {name}?"), false)? {
        client.request(&format!("/v1/pairing/mailboxes/{number}"), "DELETE", None)?;
        println!("Declined");
        return Ok(());
    }
    super::approval::approve(adapters, number, expiry, &candidate, &keys.send, || {
        admin_context(adapters, Rc::new(UreqTransport))
    })?;
    println!("{}", sanitize_console(&format!("Device {name} added")));
    Ok(())
}

fn announce(
    address: &str,
    code: &str,
    expires_at: i64,
    now: crate::time::TClock,
    emit: impl FnOnce(String),
) -> Result<u64> {
    emit(sanitize_console(&format!(
        "On the new device run: envden join {address}\nand enter code {code} (valid 10 minutes). Keep this running."
    )));
    let expiry = (expires_at.max(0) as u64).min(now() + 600_000);
    super::exchange::require_window(expiry, now())?;

    Ok(expiry)
}

fn finish_login(
    client: &crate::client::IClient,
    number: u32,
    pin: &[u8; 32],
    server_login_state: String,
    now: crate::time::TClock,
    expiry: u64,
) -> Result<p::IFinishServerLoginResult> {
    wait(
        client,
        &format!("/v1/pairing/mailboxes/{number}/KE3"),
        now,
        expiry,
    )?;
    let finish = get(client, &format!("/v1/pairing/mailboxes/{number}/KE3")).and_then(|ke3| {
        p::opaque_server_finish_login(p::IFinishServerLoginParams {
            server_login_state,
            finish_login_request: ke3,
            identifiers: Some(p::pairing_identifiers(pin, number)?.identifiers),
        })
    });
    let finish = match finish {
        Ok(finish) => finish,
        Err(error) => {
            client.request(&format!("/v1/pairing/mailboxes/{number}"), "DELETE", None)?;
            return Err(error);
        }
    };
    Ok(finish)
}

#[cfg(test)]
mod tests;
