use crate::{
    adapters::IAdapters,
    client::{IClient, text},
    identity::{IDeviceIdentity, adopt_committed_name},
    session::record_unlock_window,
    state::{empty_state, repository::save_state},
    vault::{history::IVaultHistory, join::encode_verified_state},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};

pub(crate) fn epoch_wrap(entries: &[p::ISigned<p::TEntry>], id: &[u8; 16]) -> Option<p::IWrap> {
    let mut wrap = None;
    for item in entries {
        match &item.body.change {
            p::TEntryPayload::AddDevice(v) if &v.device.id == id => wrap = Some(v.wrap.clone()),
            p::TEntryPayload::NewEpoch(v) => {
                wrap = v.change.wraps.iter().find(|w| &w.recipient == id).cloned()
            }
            p::TEntryPayload::RemoveDevice(v) => {
                wrap = v.change.wraps.iter().find(|w| &w.recipient == id).cloned()
            }
            p::TEntryPayload::ReplaceRecovery(v) => {
                wrap = v.change.wraps.iter().find(|w| &w.recipient == id).cloned()
            }
            _ => {}
        }
    }
    wrap
}

pub(crate) fn accept(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    history: &IVaultHistory,
    hash: &[u8; 32],
) -> Result<Value> {
    crate::state::lock::with_state_lock(&adapters.home, (adapters.now)(), || {
        locked_accept(adapters, client, identity, history, hash)
    })
}

fn locked_accept(
    adapters: &IAdapters,
    client: &IClient,
    identity: &IDeviceIdentity,
    history: &IVaultHistory,
    hash: &[u8; 32],
) -> Result<Value> {
    latest_membership(&history.state, &identity.record.id, &client.options.pin)?;
    let header = history
        .headers
        .iter()
        .find(|h| p::object_hash(*h, "manifest").is_ok_and(|v| &v == hash))
        .ok_or_else(|| invalid("Pairing membership verification failed"))?;
    let state = history
        .states
        .get(&header.body.list_seq)
        .ok_or_else(|| invalid("Device was not added at the approved checkpoint"))?;
    if !state.devices.contains_key(&identity.record.id) || state.server_pin != client.options.pin {
        return Err(invalid("Device was not added at the approved checkpoint"));
    }
    let entries: Vec<_> = history
        .entries
        .iter()
        .filter(|e| e.body.seq <= header.body.list_seq)
        .cloned()
        .collect();
    let existing =
        super::local_state::join_local_state(&adapters.home, &p::base32(&history.state.vault_id))?;
    if let Some(existing) = existing.as_ref().filter(|s| s["checkpoint"].is_string()) {
        let floor = crate::client::binary(existing["checkpoint"].as_str().expect("checkpoint"))?;
        let descends = history
            .headers
            .iter()
            .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v.as_slice() == floor));
        let dropped = !descends
            && matches!(
                crate::admin::rejoin::classify::check(adapters, history)?,
                Some(envden_protocol::chain::TNonMember::DroppedByRepair)
            );
        if !descends && !dropped {
            return Err(EnvdenError::new(
                ErrorCode::Fork,
                "Joined history does not descend from the local checkpoint",
            ));
        }
        if !dropped {
            return super::vault::advance::advance(adapters, client, identity, existing, history);
        }
    }
    let wrap = epoch_wrap(&entries, &identity.record.id)
        .ok_or_else(|| invalid("Missing device epoch wrap"))?;
    let commit = state
        .commits
        .get(&header.body.epoch)
        .ok_or_else(|| invalid("Missing device epoch wrap"))?;
    let key = p::open_wrap(
        &wrap,
        &identity.keys.enc_sk,
        &identity.record.enc_pub,
        &state.vault_id,
        header.body.epoch,
        commit,
    )?;
    let blob = |resource: &str, label: &str, hash: &[u8; 32]| -> Result<Vec<u8>> {
        let bytes = client
            .request(&format!("/v1/{resource}/{}", text(hash)), "GET", None)?
            .body;
        if p::h(label, &bytes) != *hash {
            return Err(invalid("Invalid join blob hash"));
        }
        Ok(bytes)
    };
    let box_bytes = blob("keyrings", "keyring-blob", &header.body.keyring_hash)?;
    let ring = p::open_keyring(
        &box_bytes,
        &key,
        &state.vault_id,
        header.body.epoch,
        &state.commits,
        existing
            .as_ref()
            .map(|_| {
                adapters
                    .keychain
                    .get(&format!("envden/{}/id-key", adapters.home.display()), false)
            })
            .transpose()?
            .flatten()
            .as_deref()
            .map(p::fixed)
            .transpose()?
            .as_ref(),
    )?;
    let files = blob("files", "files", &header.body.files_hash)?;
    let _: p::IFiles = p::decode(&files)?;
    let committed = &state.devices[&identity.record.id];
    adopt_committed_name(&*adapters.keychain, &adapters.home, committed)?;
    let mut local = existing.unwrap_or_else(|| empty_state(&committed.name));
    local["deviceName"] = json!(committed.name);
    local["verifiedState"] = encode_verified_state(state, &history.entries)?;
    local["vaultId"] = json!(p::base32(&state.vault_id));
    local["server"] =
        json!({"address":client.options.address,"pin":text(&client.options.pin),"protocol":1});
    local["checkpoint"] = json!(text(hash));
    local["headers"] = json!(
        history
            .headers
            .iter()
            .filter(|v| v.body.seq <= header.body.seq)
            .map(|v| p::encode(v).map(|b| text(&b)))
            .collect::<Result<Vec<_>>>()?
    );
    local["entries"] = json!(
        history
            .entries
            .iter()
            .filter(|v| v.body.seq <= header.body.list_seq)
            .map(|v| p::encode(v).map(|b| text(&b)))
            .collect::<Result<Vec<_>>>()?
    );
    local["keyring"] = json!(text(&box_bytes));
    local["files"] = json!(text(&files));
    record_unlock_window(client, &mut local)?;
    adapters.keychain.set(
        &format!(
            "envden/{}/epoch/{}",
            adapters.home.display(),
            header.body.epoch
        ),
        &key,
    )?;
    adapters.keychain.set(
        &format!("envden/{}/id-key", adapters.home.display()),
        &ring.id_key,
    )?;
    save_state(&adapters.home, &local, (adapters.now)())?;
    Ok(local)
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}

fn latest_membership(
    state: &envden_protocol::chain::IDeviceListState,
    id: &[u8; 16],
    pin: &[u8; 32],
) -> Result<()> {
    if !state.devices.contains_key(id) || state.server_pin != *pin {
        return Err(invalid("Pairing membership verification failed"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
