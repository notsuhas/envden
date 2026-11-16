use super::{
    ICheckoutOptions,
    accept::{accept, epoch_wrap},
    preferences::preferences,
    setup::device_name,
    setup_checkouts,
    vault::add_swap::add_swap,
    vault::connection::connection,
};
use crate::{
    adapters::IAdapters,
    client::{UreqTransport, hello, retry_head},
    identity::device_identity,
    output::prompts::secret,
    session::{TPassword, login},
    state::{files::atomic_write, lock::with_state_lock, repository::load_state},
    vault::{history::read_history, recovery::read_kit},
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::path::Path;
use zeroize::Zeroizing;

pub fn run_join(adapters: &IAdapters, address: &str, options: &Value) -> Result<Value> {
    crate::state::files::private_directory(&adapters.home)?;
    let mut options = options.clone();
    let rejoin = load_state(&adapters.home)?.is_some_and(|s| s["checkpoint"].is_string());
    options["rejoin"] = json!(rejoin);
    let options = &options;
    if !rejoin {
        with_state_lock(&adapters.home, (adapters.now)(), || {
            crate::pairing::persistence::guard(adapters)
        })?;
    }
    let mut state = if options["recovery"] == true || options["recoveryKit"].is_string() {
        let name = device_name(options)?;
        let kit = read_kit(options["recoveryKit"].as_str().map(Path::new))?;
        let password = secret("Master password", |_| None)?;
        with_state_lock(&adapters.home, (adapters.now)(), || {
            retry_head(|| {
                recovery(
                    adapters,
                    address,
                    &name,
                    &kit.vault_id,
                    &kit.secret_key,
                    &password,
                )
            })
        })?
    } else {
        crate::pairing::join(adapters, address, options)?
    };
    preferences(adapters, options, false)?;
    setup_checkouts(adapters, &mut state, &ICheckoutOptions::default())?;
    super::complete::first_run(adapters)
}

fn recovery(
    adapters: &IAdapters,
    address: &str,
    name: &str,
    vault: &str,
    secret: &str,
    password: &str,
) -> Result<Value> {
    super::local_state::join_local_state(&adapters.home, vault)?;
    let vault_id = p::fixed(&p::unbase32(vault)?)?;
    let server = hello(address, None, &UreqTransport, MIN_SERVER)?;
    let pending = adapters.home.join("state/kit-join");
    let attempt = json!({"vaultId":vault,"pin":p::base32(&server.pin),"name":name}).to_string();
    let resuming = super::kit_attempt::pending_matches(&pending, &attempt)?;
    let rejoin = load_state(&adapters.home)?.is_some_and(|s| s["checkpoint"].is_string());
    let namespace = if rejoin {
        adapters.home.join("rejoin")
    } else {
        adapters.home.clone()
    };
    let identity = device_identity(
        &*adapters.keychain,
        &namespace,
        name,
        !resuming && !rejoin,
        (adapters.now)(),
    )?;
    atomic_write(&pending, attempt.as_bytes(), (adapters.now)())?;
    let client = connection(adapters, address, server.pin, vault_id, &identity);
    if resuming {
        match login(
            &client,
            &vault_id,
            TPassword::Fixed(password),
            p::TLoginPurpose::Unlock,
        ) {
            Ok(_) => {
                let history = read_history(&client, &vault_id, None)?;
                let hash =
                    super::vault::kit_resume::checkpoint(&history.headers, &identity.record.id)?;
                require_pin(&history, &server.pin)?;
                if rejoin {
                    crate::admin::rejoin::classify::check(adapters, &history)?;
                }
                let local = accept(adapters, &client, &identity, &history, &hash)?;
                if rejoin {
                    crate::admin::rejoin::classify::finish_identity(adapters)?;
                }
                super::kit_attempt::remove_pending(&pending)?;
                return Ok(local);
            }
            Err(error) if error.code == ErrorCode::NotMember => {}
            Err(error) => return Err(error),
        }
    }
    login(
        &client,
        &vault_id,
        TPassword::Fixed(password),
        p::TLoginPurpose::Kit,
    )?;
    let history = read_history(&client, &vault_id, None)?;
    require_pin(&history, &server.pin)?;
    if rejoin {
        crate::admin::rejoin::classify::check(adapters, &history)?;
    }
    let head = history.headers.last().expect("history");
    let bytes = client.request("/v1/envelope", "GET", None)?.body;
    if p::h("envelope-blob", &bytes) != head.body.envelope_hash {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Envelope hash mismatch",
        ));
    }
    let secret = Zeroizing::new(p::decode_secret_key(secret)?);
    let envelope = p::open_envelope(&bytes, password, &secret, &vault_id)?;
    drop(secret);
    if envelope.checkpoint != [0; 32]
        && !history
            .headers
            .iter()
            .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == envelope.checkpoint))
    {
        return Err(EnvdenError::new(
            ErrorCode::Rollback,
            "Envelope checkpoint missing from history",
        ));
    }
    let wrap = epoch_wrap(&history.entries, &history.state.recovery.id)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing recovery wrap"))?;
    let epoch = p::open_wrap(
        &wrap,
        &envelope.recovery_enc_sk,
        &history.state.recovery.enc_pub,
        &vault_id,
        history.state.epoch,
        &history.state.commits[&history.state.epoch],
    )?;
    let swap = add_swap(
        &history,
        identity.record.clone(),
        (history.state.recovery.id, &envelope.recovery_obj_sk),
        &epoch,
        3,
        &identity,
        (adapters.now)(),
    )?;
    super::kit_attempt::submit(&client, &swap, &history.state.recovery.obj_pub)?;
    let updated = read_history(&client, &vault_id, None)?;
    if rejoin {
        crate::admin::rejoin::classify::check(adapters, &updated)?;
    }
    let local = accept(
        adapters,
        &client,
        &identity,
        &updated,
        &p::object_hash(&swap.header, "manifest")?,
    )?;
    if rejoin {
        crate::admin::rejoin::classify::finish_identity(adapters)?;
    }
    super::kit_attempt::remove_pending(&pending)?;
    Ok(local)
}

fn require_pin(history: &crate::vault::history::IVaultHistory, pin: &[u8; 32]) -> Result<()> {
    if history.state.server_pin != *pin {
        return Err(EnvdenError::new(
            ErrorCode::Moving,
            "Vault moved; use its current server address",
        ));
    }
    Ok(())
}

#[cfg(test)]
#[path = "join_tests.rs"]
mod tests;
