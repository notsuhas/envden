use super::connection::connection;
use crate::{
    adapters::IAdapters,
    client::{UreqTransport, hello, text},
    identity::device_identity,
    onboarding::{confirmed_password, require_server_address},
    output::prompts::{input, secret},
    session::{record_unlock_window, register_password},
    state::{
        empty_state,
        repository::{load_state, save_state},
    },
    vault::{create_genesis, create_vault_swap},
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::rc::Rc;

pub(in crate::onboarding) fn create(adapters: &IAdapters, options: &Value) -> Result<Value> {
    let hosted = crate::onboarding::host::host_locally(adapters, options)?;
    let is_hosted = hosted.is_some();
    let address = require_server_address(&match options["server"].as_str() {
        Some(v) => v.to_owned(),
        None if hosted.is_some() => hosted.as_ref().expect("host").0.clone(),
        None => input("Server address", true, None, |v| {
            crate::onboarding::address_problem(v).map(str::to_owned)
        })?,
    })?;
    let token = match options["setupToken"].as_str() {
        Some(v) => v.to_owned(),
        None => match hosted.and_then(|v| v.1) {
            Some(token) => token,
            None => super::token::read_token()?,
        },
    };
    super::preflight::preflight(is_hosted, || {
        let token = p::decode_token(p::TTokenKind::Setup, &token)?;
        let server = hello(&address, None, &UreqTransport, MIN_SERVER).map_err(|error| {
            if matches!(
                error.code,
                ErrorCode::ServerTooOld | ErrorCode::UpdateRequired
            ) {
                error
            } else {
                EnvdenError::with_source(
                    ErrorCode::ServerUnreachable,
                    format!(
                        "Can't reach {address}. Check the address and that the server is running"
                    ),
                    error,
                )
            }
        })?;
        if server.pin != token.1 {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "This setup token is for a different server",
            ));
        }
        Ok(())
    })?;
    let name = crate::onboarding::setup::device_name(options)?;
    let password = confirmed_password(|label| secret(label, |_| None), 3, |v| eprintln!("{v}"))?;
    let token = p::decode_token(p::TTokenKind::Setup, &token)?;
    hello(&address, Some(&token.1), &UreqTransport, MIN_SERVER)?;
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        &name,
        false,
        (adapters.now)(),
    )?;
    if let Some(mut pending) = load_state(&adapters.home)?
        && let Some(encoded) = pending["creationPending"].as_str()
    {
        let bytes = crate::client::binary(encoded)?;
        let swap: p::ISwap = p::decode(&bytes)?;
        let vault_id = p::fixed(&p::unbase32(
            pending["vaultId"].as_str().unwrap_or_default(),
        )?)?;
        let mut client = connection(
            adapters,
            pending["server"]["address"].as_str().unwrap_or(&address),
            token.1,
            vault_id,
            &identity,
        );
        let key = p::token_key(p::TTokenKind::Setup, &token.0);
        client.options.proof = Some(Rc::new(move |request| {
            p::token_proof(p::TTokenKind::Setup, &key, request).map(|v| v.to_vec())
        }));
        let epoch = adapters.keychain.get(
            &format!("envden/{}/epoch/1", adapters.home.display()),
            false,
        )?;
        let id = adapters
            .keychain
            .get(&format!("envden/{}/id-key", adapters.home.display()), false)?;
        if super::pending::matches_pending(
            &swap,
            &vault_id,
            epoch.as_deref(),
            id.as_deref(),
            &identity.record.id,
        ) {
            let kit = super::pending_kit::resume_secret(options)?
                .map(|secret| {
                    super::pending_kit::resumed_kit(
                        &swap,
                        pending["vaultId"].as_str().unwrap_or_default(),
                        &address,
                        &secret,
                    )
                })
                .transpose()?;
            match client.request_bytes("/v1/vault", "POST", &bytes) {
                Ok(_) => {
                    pending
                        .as_object_mut()
                        .expect("state")
                        .shift_remove("creationPending");
                    record_unlock_window(&client, &mut pending)?;
                    save_state(&adapters.home, &pending, (adapters.now)())?;
                    return if kit.is_some() {
                        Ok(pending)
                    } else {
                        super::pending_kit::replace_lost(adapters, options, &name, &password)
                    };
                }
                Err(error) if error.code == ErrorCode::Unauthorized => {}
                Err(error) => return Err(error),
            }
        }
    }
    let material = create_genesis(&identity, token.1, (adapters.now)())?;
    let mut client = connection(adapters, &address, token.1, material.vault_id, &identity);
    let key = p::token_key(p::TTokenKind::Setup, &token.0);
    client.options.proof = Some(Rc::new(move |request| {
        p::token_proof(p::TTokenKind::Setup, &key, request).map(|v| v.to_vec())
    }));
    let record = register_password(&client, &material.vault_id, &password)?;
    let creation = create_vault_swap(&material, &identity, &password, &record, (adapters.now)())?;
    let kit = setup_kit(&creation.secret_key, &creation.vault_id, &address);
    super::pending_kit::report(adapters, options, &name, &kit)?;
    let mut state = empty_state(&name);
    state["vaultId"] = json!(creation.vault_id);
    state["server"] = json!({"address":address,"pin":text(&token.1),"protocol":1});
    state["entries"] = json!([
        text(&p::encode(&material.genesis)?),
        text(&p::encode(&material.epoch)?)
    ]);
    state["keyring"] = json!(text(&material.keyring));
    let bytes = p::encode(&creation.swap)?;
    state["creationPending"] = json!(text(&bytes));
    state["headers"] = json!([text(&p::encode(&creation.swap.header)?)]);
    state["files"] = json!(text(&p::encode(
        creation.swap.files.as_ref().expect("creation files")
    )?));
    state["checkpoint"] = json!(text(&p::object_hash(&creation.swap.header, "manifest")?));
    adapters.keychain.set(
        &format!("envden/{}/epoch/1", adapters.home.display()),
        &material.epoch_key,
    )?;
    adapters.keychain.set(
        &format!("envden/{}/id-key", adapters.home.display()),
        &material.id_key,
    )?;
    save_state(&adapters.home, &state, (adapters.now)())?;
    client.request_bytes("/v1/vault", "POST", &bytes)?;
    state
        .as_object_mut()
        .expect("state")
        .shift_remove("creationPending");
    record_unlock_window(&client, &mut state)?;
    save_state(&adapters.home, &state, (adapters.now)())?;
    Ok(state)
}

fn setup_kit(secret: &str, vault: &str, address: &str) -> Value {
    json!({"secretKey":secret,"vaultId":vault,"server":address,"masterPassword":"________________"})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn kit_serializes_in_reference_order() {
        let kit = setup_kit("secret", "vault", "server");
        assert_eq!(
            kit.as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            ["secretKey", "vaultId", "server", "masterPassword"]
        );
    }
}
