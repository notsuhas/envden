use super::{
    commit::{commit, entry, finish_swap},
    material::next_epoch,
    pending,
};
use crate::{
    adapters::IAdapters,
    admin::shared::{
        context::{IAdminContext, admin_context},
        history::current_history,
        swap::admin_swap,
    },
    client::{ITransport, binary, retry_head},
    session::{TPassword, login, register_password},
    state::lock::with_state_lock,
    vault::history::IVaultHistory,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::rc::Rc;

fn recovery(keys: &p::IRecoveryKeys) -> p::IRecoveryRecord {
    p::IRecoveryRecord {
        id: p::recovery_id(&keys.enc_pub, &keys.obj_pub),
        enc_pub: keys.enc_pub,
        obj_pub: keys.obj_pub,
    }
}

fn envelope(
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    keys: &p::IRecoveryKeys,
    password: &str,
    secret: &[u8; 16],
) -> Result<Vec<u8>> {
    p::seal_envelope(
        &p::IEnvelope {
            vault_id: context.vault_id,
            recovery_enc_sk: keys.enc_sk,
            recovery_obj_sk: keys.obj_sk,
            checkpoint: p::object_hash(history.headers.last().expect("history"), "manifest")?,
            sealed_at: (context.adapters.now)(),
        },
        password,
        secret,
        &p::random_bytes(),
        &p::random_bytes(),
    )
}

pub fn replace(
    adapters: &IAdapters,
    password: &str,
    transport: Rc<dyn ITransport>,
    removed: Option<[u8; 16]>,
    show: &mut dyn FnMut(&Value) -> Result<()>,
) -> Result<bool> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        let mut keys = p::generate_recovery_keys(p::random_bytes);
        let mut secret = p::random_bytes();
        let mut shown = false;
        let result = retry_head(|| {
            let context = admin_context(adapters, transport.clone())?;
            if pending::settle(&context)? {
                return Ok(true);
            }
            login(
                &context.client,
                &context.vault_id,
                TPassword::Fixed(password),
                p::TLoginPurpose::Unlock,
            )?;
            let history = current_history(&context)?;
            let recovery = recovery(&keys);
            let (change, keyring) = next_epoch(&context, &history, &recovery, removed)?;
            let payload = match removed {
                Some(device) => p::TEntryPayload::RemoveDevice(p::IRemoveDevice {
                    device,
                    new_recovery: Some(recovery),
                    change,
                }),
                None => p::TEntryPayload::ReplaceRecovery(p::IReplaceRecovery { recovery, change }),
            };
            let entry = entry(&context, &history, payload)?;
            let sealed = envelope(&context, &history, &keys, password, &secret)?;
            let mut swap = finish_swap(
                admin_swap(
                    &history,
                    &context.identity,
                    if removed.is_some() { 5 } else { 7 },
                    (adapters.now)(),
                    vec![entry],
                )?,
                &context,
                Some(keyring),
                Some(sealed),
            )?;
            swap.sk_pub = Some(p::sk_pub(&secret, &context.vault_id));
            let kit = json!({"vaultId":p::base32(&context.vault_id), "secretKey":p::encode_secret_key(&secret), "server":context.local["server"]["address"]});
            pending::save(&context, &swap)?;
            if !shown {
                show(&kit)?;
                shown = true;
            }
            commit(&context, &swap)?;
            pending::clear(&context)?;
            Ok(false)
        });
        keys.enc_sk.fill(0);
        keys.obj_sk.fill(0);
        secret.fill(0);
        result
    })
}

pub fn change(
    adapters: &IAdapters,
    old: &str,
    new: &str,
    kit: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        retry_head(|| {
            let context = admin_context(adapters, transport.clone())?;
            login(
                &context.client,
                &context.vault_id,
                TPassword::Fixed(old),
                p::TLoginPurpose::Unlock,
            )?;
            let history = current_history(&context)?;
            let bytes = context.client.request("/v1/envelope", "GET", None)?.body;
            if p::h("envelope-blob", &bytes)
                != history.headers.last().expect("history").body.envelope_hash
            {
                return Err(EnvdenError::new(
                    ErrorCode::InvalidData,
                    "Envelope hash mismatch",
                ));
            }
            let mut secret = p::decode_secret_key(kit)?;
            let mut opened = p::open_envelope(&bytes, old, &secret, &context.vault_id)?;
            let result = (|| {
                let record = register_password(&context.client, &context.vault_id, new)?;
                opened.checkpoint =
                    p::object_hash(history.headers.last().expect("history"), "manifest")?;
                opened.sealed_at = (adapters.now)();
                let sealed = p::seal_envelope(
                    &opened,
                    new,
                    &secret,
                    &p::random_bytes(),
                    &p::random_bytes(),
                )?;
                let mut swap = finish_swap(
                    admin_swap(&history, &context.identity, 8, (adapters.now)(), vec![])?,
                    &context,
                    None,
                    Some(sealed),
                )?;
                swap.opaque_record = Some(binary(&record)?);
                commit(&context, &swap)
            })();
            secret.fill(0);
            opened.recovery_enc_sk.fill(0);
            opened.recovery_obj_sk.fill(0);
            result
        })
    })
}

pub fn reset(
    adapters: &IAdapters,
    password: &str,
    kit: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        retry_head(|| {
            let mut secret = p::decode_secret_key(kit)?;
            let mut keys = p::generate_recovery_keys(p::random_bytes);
            let result = (|| {
                let mut context = admin_context(adapters, transport.clone())?;
                context.client.options.proof = Some(Rc::new(move |request| {
                    p::sign_sk_proof(&secret, &request.vault_id, request).map(|b| b.to_vec())
                }));
                let history = current_history(&context)?;
                let recovery = recovery(&keys);
                let (change, keyring) = next_epoch(&context, &history, &recovery, None)?;
                let entry = entry(
                    &context,
                    &history,
                    p::TEntryPayload::ReplaceRecovery(p::IReplaceRecovery { recovery, change }),
                )?;
                let record = register_password(&context.client, &context.vault_id, password)?;
                let sealed = envelope(&context, &history, &keys, password, &secret)?;
                let mut swap = finish_swap(
                    admin_swap(
                        &history,
                        &context.identity,
                        9,
                        (adapters.now)(),
                        vec![entry],
                    )?,
                    &context,
                    Some(keyring),
                    Some(sealed),
                )?;
                swap.opaque_record = Some(binary(&record)?);
                commit(&context, &swap)
            })();
            secret.fill(0);
            keys.enc_sk.fill(0);
            keys.obj_sk.fill(0);
            result
        })
    })
}
