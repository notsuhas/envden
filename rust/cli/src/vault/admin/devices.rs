use super::{
    commit::{commit, entry, finish_swap},
    material::next_epoch,
};
use crate::{
    adapters::IAdapters,
    admin::shared::{context::admin_context, history::current_history, swap::admin_swap},
    client::{ITransport, retry_head, text},
    session::{TPassword, login},
    state::lock::with_state_lock,
    vault::history::IVaultHistory,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::{collections::BTreeSet, rc::Rc};

pub fn recovery_holders(history: &IVaultHistory) -> BTreeSet<[u8; 16]> {
    let mut holders = BTreeSet::new();
    for (index, header) in history.headers.iter().enumerate() {
        if index == 0 || history.headers[index - 1].body.envelope_hash != header.body.envelope_hash
        {
            holders.insert(header.body.signer);
        }
    }
    let devices: BTreeSet<_> = history
        .entries
        .iter()
        .filter_map(|e| match &e.body.change {
            p::TEntryPayload::Genesis(v) => Some(v.device.id),
            p::TEntryPayload::AddDevice(v) => Some(v.device.id),
            _ => None,
        })
        .collect();
    for signed in &history.entries {
        if let p::TEntryPayload::AddDevice(v) = &signed.body.change
            && !devices.contains(&signed.body.signer)
        {
            holders.insert(v.device.id);
        }
    }
    holders
}

pub fn list(adapters: &IAdapters, transport: Rc<dyn ITransport>) -> Result<Vec<Value>> {
    let context = admin_context(adapters, transport)?;
    let history = current_history(&context)?;
    let holders = recovery_holders(&history);
    let seen: p::IDevicesResponse =
        serde_json::from_value(context.client.request("/v1/devices", "GET", None)?.json()?)
            .map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", e)
            })?;
    let verified = crate::vault::join::encode_verified_state(&history.state, &history.entries)?;
    verified["devices"]["$map"].as_array().expect("devices").iter().map(|pair| {
        let id = p::fixed(&p::unbase32(pair[0].as_str().expect("id"))?)?;
        let device = &history.state.devices[&id];
        let found = seen.devices.iter().find(|v| v.id == text(&device.id));
        Ok(json!({"id":p::base32(&device.id), "name":device.name, "clientVersion":found.and_then(|v| v.client_version.clone()), "unconfirmed":!found.is_some_and(|v| v.confirmed), "recoveryKeyHeld":holders.contains(&device.id), "current":device.id == context.identity.record.id}))
    }).collect()
}

fn rename_check<'a>(
    mut devices: impl Iterator<Item = &'a p::IDeviceRecord>,
    own: &[u8; 16],
    name: &str,
) -> &'static str {
    if !p::is_device_name(name) {
        return "invalid";
    }
    match devices.find(|d| d.name == name) {
        None => "rename",
        Some(d) if &d.id == own => "unchanged",
        Some(_) => "taken",
    }
}

pub fn rename(adapters: &IAdapters, name: &str, transport: Rc<dyn ITransport>) -> Result<bool> {
    with_state_lock(&adapters.home, &adapters.now, || {
        retry_head(|| {
            let context = admin_context(adapters, transport.clone())?;
            let history = current_history(&context)?;
            let own = context.identity.record.id;
            match rename_check(history.state.devices.values(), &own, name) {
                "unchanged" => return Ok(false),
                "taken" => {
                    return Err(EnvdenError::new(
                        ErrorCode::InvalidInput,
                        "Another device has that name",
                    ));
                }
                "invalid" => {
                    return Err(EnvdenError::new(
                        ErrorCode::InvalidInput,
                        "Device names are 1-64 bytes with no invisible characters",
                    ));
                }
                _ => {}
            }
            let entry = entry(
                &context,
                &history,
                p::TEntryPayload::RenameDevice(p::IRenameDevice {
                    device: own,
                    name: name.into(),
                }),
            )?;
            commit(
                &context,
                &admin_swap(
                    &history,
                    &context.identity,
                    13,
                    (adapters.now)(),
                    vec![entry],
                )?,
            )?;
            Ok(true)
        })
    })
}

pub fn rotate(adapters: &IAdapters, password: &str, transport: Rc<dyn ITransport>) -> Result<()> {
    with_state_lock(&adapters.home, &adapters.now, || {
        retry_head(|| {
            let context = admin_context(adapters, transport.clone())?;
            login(
                &context.client,
                &context.vault_id,
                TPassword::Fixed(password),
                p::TLoginPurpose::Unlock,
            )?;
            let history = current_history(&context)?;
            let (change, keyring) = next_epoch(&context, &history, &history.state.recovery, None)?;
            let entry = entry(
                &context,
                &history,
                p::TEntryPayload::NewEpoch(p::INewEpoch { change }),
            )?;
            commit(
                &context,
                &finish_swap(
                    admin_swap(
                        &history,
                        &context.identity,
                        6,
                        (adapters.now)(),
                        vec![entry],
                    )?,
                    &context,
                    Some(keyring),
                    None,
                )?,
            )
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rename_matrix() {
        let device = p::IDeviceRecord {
            id: [1; 16],
            name: "laptop".into(),
            enc_pub: [0; 32],
            obj_pub: [0; 32],
            req_pub: [0; 32],
        };
        for (own, name, expected) in [
            ([1; 16], "laptop", "unchanged"),
            ([2; 16], "laptop", "taken"),
            ([1; 16], "new", "rename"),
            ([1; 16], "", "invalid"),
            ([1; 16], "bad\nname", "rename"),
            ([1; 16], "work\u{200b}", "invalid"),
            (
                [1; 16],
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "invalid",
            ),
        ] {
            assert_eq!(rename_check(std::iter::once(&device), &own, name), expected);
        }
    }
}
