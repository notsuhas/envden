use super::exchange::{put, wait};
use crate::{
    adapters::IAdapters,
    client::{UreqTransport, binary, hello, text},
    identity::{device_identity, read_identity},
    onboarding::{accept::accept, setup::device_name, vault::connection::connection},
    output::prompts::input,
    state::{files::atomic_write, repository::load_state},
    vault::history::read_history,
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};

fn join_inner(adapters: &IAdapters, address: &str, options: &Value) -> Result<Value> {
    let receive = format!("envden/{}/pair-receive", adapters.home.display());
    let resume = options["resume"] == true;
    if resume && adapters.keychain.get(&receive, false)?.is_none() {
        return Err(EnvdenError::new(
            ErrorCode::NotFound,
            "No pairing exchange to resume",
        ));
    }
    let identity = if resume {
        let bytes = adapters
            .keychain
            .get(&format!("envden/{}/device", adapters.home.display()), false)?
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::NotFound, "No pairing exchange to resume")
            })?;
        read_identity(&bytes)?
    } else {
        let name = device_name(options)?;
        super::persistence::clear(adapters)?;
        device_identity(
            &*adapters.keychain,
            &adapters.home,
            &name,
            !load_state(&adapters.home)?.is_some_and(|s| s.get("checkpoint").is_some()),
            (adapters.now)(),
        )?
    };
    let expected = if resume {
        std::fs::read_to_string(adapters.home.join("state/pair-pin"))
            .ok()
            .map(|v| binary(&v).and_then(|v| p::fixed(&v)))
            .transpose()?
    } else {
        None
    };
    let server = hello(address, expected.as_ref(), &UreqTransport, MIN_SERVER)?;
    let client = connection(adapters, address, server.pin, [0; 32], &identity);
    if !resume {
        atomic_write(
            &adapters.home.join("state/pair-pin"),
            text(&server.pin).as_bytes(),
            (adapters.now)(),
        )?;
        let code = input("Pairing code", true, None, |v| {
            p::normalize_pairing_code(v)
                .err()
                .map(|e| e.message.to_string())
        })?;
        let (mailbox, password) = p::normalize_pairing_code(&code)?;
        let start = p::opaque_start_login(p::IStartClientLoginParams {
            password: password.clone(),
        })?;
        let expires = put(&client, mailbox, "KE1", &start.start_login_request)?
            .min((adapters.now)() + 600_000);
        atomic_write(
            &adapters.home.join("state/pair-expiry"),
            expires.to_string().as_bytes(),
            (adapters.now)(),
        )?;
        let response = wait(
            &client,
            &format!("/v1/pairing/mailboxes/{mailbox}/KE2"),
            adapters.now,
            expires,
        )?;
        let finish = p::opaque_finish_login(p::IFinishClientLoginParams {
            password,
            client_login_state: start.client_login_state,
            login_response: response,
            identifiers: Some(p::pairing_identifiers(&server.pin, mailbox)?.identifiers),
            key_stretching_function_config: None,
        })?
        .ok_or_else(|| {
            EnvdenError::new(
                ErrorCode::Unauthorized,
                "Incorrect pairing code; make a new code",
            )
        })?;
        let (send, receive_key) = p::pairing_channel_keys(&binary(&finish.session_key)?)?;
        let message = text(&p::seal_pair_joiner(
            &p::IPairJoiner {
                device: identity.record.clone(),
            },
            &send,
            &p::random_bytes(),
        )?);
        adapters.keychain.set(&receive, &receive_key)?;
        atomic_write(
            &adapters.home.join("state/pair-joiner"),
            json!({"mailbox":mailbox,"ke3":finish.finish_login_request,"message":message})
                .to_string()
                .as_bytes(),
            (adapters.now)(),
        )?;
        put(&client, mailbox, "KE3", &finish.finish_login_request)?;
        put(&client, mailbox, "PairJoiner", &message)?;
        println!("Waiting for the approving device");
    }
    let expiry = std::fs::read_to_string(adapters.home.join("state/pair-expiry"))
        .ok()
        .and_then(|v| v.parse::<u64>().ok());
    if resume
        && expiry.is_some_and(|v| (adapters.now)() < v)
        && let Ok(saved) = std::fs::read_to_string(adapters.home.join("state/pair-joiner"))
    {
        let value: Value = serde_json::from_str(&saved).map_err(|e| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Invalid stored pairing exchange", e)
        })?;
        let mailbox = value["mailbox"].as_u64().ok_or_else(|| {
            EnvdenError::new(ErrorCode::InvalidData, "Invalid stored pairing exchange")
        })? as u32;
        for (slot, field) in [("KE3", "ke3"), ("PairJoiner", "message")] {
            let message = value[field].as_str().ok_or_else(|| {
                EnvdenError::new(ErrorCode::InvalidData, "Invalid stored pairing exchange")
            })?;
            if let Err(error) = put(&client, mailbox, slot, message)
                && error.code != ErrorCode::NotFound
            {
                return Err(error);
            }
        }
    }
    let key = adapters
        .keychain
        .get(&receive, false)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "No pairing exchange to resume"))?;
    let message = wait(
        &client,
        "/v1/pairing/approver",
        adapters.now,
        expiry
            .map(|v| v.saturating_add(86_400_000))
            .unwrap_or_else(|| (adapters.now)() + 86_400_000),
    )?;
    let approval = p::open_pair_approver(&binary(&message)?, &p::fixed(&key)?)?;
    if approval.server_pin != server.pin {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Pairing server pin mismatch",
        ));
    }
    let client = client.for_vault(approval.vault_id);
    let history = read_history(&client, &approval.vault_id, None)?;
    let local = accept(
        adapters,
        &client,
        &identity,
        &history,
        &approval.manifest_hash,
    )?;
    adapters.keychain.delete(&receive)?;
    super::persistence::clear(adapters)?;
    Ok(local)
}

pub fn join(adapters: &IAdapters, address: &str, options: &Value) -> Result<Value> {
    let result = join_inner(adapters, address, options);
    if let Err(error) = &result {
        if matches!(
            error.code,
            ErrorCode::Unauthorized
                | ErrorCode::Conflict
                | ErrorCode::InvalidData
                | ErrorCode::Fork
        ) || (error.code == ErrorCode::NotFound && options["resume"] != true)
        {
            super::persistence::clear(adapters)?;
        }
        if error.code == ErrorCode::Busy && !adapters.home.join("state/pair-joiner").exists() {
            super::persistence::clear(adapters)?;
            return Err(EnvdenError::new(
                ErrorCode::Busy,
                "Pairing timed out before login; create a new pairing code",
            ));
        }
    }
    result
}
