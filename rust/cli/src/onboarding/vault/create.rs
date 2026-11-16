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
use envden_core::errors::Result;
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
    let token =
        match super::token::provided(hosted.and_then(|v| v.1), options["setupToken"].as_str())? {
            Some(token) => token,
            None => super::token::read_token()?,
        };
    super::preflight::preflight(is_hosted, || {
        super::preflight::check_server(&address, &token, &UreqTransport)
    })?;
    let name = crate::onboarding::setup::device_name(adapters, options)?;
    let password = confirmed_password(|label| secret(label, |_| None), 3, |v| eprintln!("{v}"))?;
    setup(adapters, options, &address, &token, &name, &password)
}

fn setup(
    adapters: &IAdapters,
    options: &Value,
    address: &str,
    token: &str,
    name: &str,
    password: &str,
) -> Result<Value> {
    let existing = load_state(&adapters.home)?;
    if let Some(state) = existing.as_ref()
        && state["vaultId"].as_str().is_some_and(|v| !v.is_empty())
        && state["creationPending"].as_str().is_none_or(str::is_empty)
    {
        return Ok(state.clone());
    }
    let token = p::decode_token(p::TTokenKind::Setup, token)?;
    hello(address, Some(&token.1), &UreqTransport, MIN_SERVER)?;
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        name,
        false,
        &adapters.now,
    )?;
    if let Some(state) = super::resume_creation::resume(
        adapters,
        options,
        address,
        &token,
        &identity,
        (name, password),
        existing,
    )? {
        return Ok(state);
    }
    let material = create_genesis(&identity, token.1, (adapters.now)())?;
    let mut client = connection(adapters, address, token.1, material.vault_id, &identity);
    let key = p::token_key(p::TTokenKind::Setup, &token.0);
    client.options.proof = Some(Rc::new(move |request| {
        p::token_proof(p::TTokenKind::Setup, &key, request).map(|v| v.to_vec())
    }));
    let record = register_password(&client, &material.vault_id, password)?;
    let creation = create_vault_swap(&material, &identity, password, &record, (adapters.now)())?;
    let kit = setup_kit(&creation.secret_key, &creation.vault_id, address);
    super::pending_kit::report(adapters, options, name, &kit)?;
    let mut state = empty_state(name);
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
    save_state(&adapters.home, &state, &adapters.now)?;
    client.request_bytes("/v1/vault", "POST", &bytes)?;
    state
        .as_object_mut()
        .expect("state")
        .shift_remove("creationPending");
    record_unlock_window(&client, &mut state)?;
    save_state(&adapters.home, &state, &adapters.now)?;
    Ok(state)
}

fn setup_kit(secret: &str, vault: &str, address: &str) -> Value {
    json!({"secretKey":secret,"vaultId":vault,"server":address,"masterPassword":"________________"})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn already_created_returns_without_server_or_prompts() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let mut state = empty_state("test");
        state["vaultId"] = json!(p::base32(&[1; 32]));
        save_state(&adapters.home, &state, &|| 42).unwrap();
        assert_eq!(
            setup(
                &adapters,
                &json!({}),
                "invalid",
                "invalid",
                "test",
                "password"
            )
            .unwrap(),
            state
        );
    }

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
