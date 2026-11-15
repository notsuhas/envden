use crate::{
    admin::shared::context::IAdminContext,
    state::files::atomic_write,
    vault::history::{IVaultHistory, read_history},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub fn entry(
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    change: p::TEntryPayload,
) -> Result<p::ISigned<p::TEntry>> {
    p::sign_object(
        p::TEntry {
            vault_id: context.vault_id,
            seq: history.state.seq + 1,
            parent: history.state.head,
            change,
            signer: context.identity.record.id,
        },
        &context.identity.keys.obj_sk,
        "entry",
    )
}

pub fn finish_swap(
    mut swap: p::ISwap,
    context: &IAdminContext<'_>,
    keyring: Option<Vec<u8>>,
    envelope: Option<Vec<u8>>,
) -> Result<p::ISwap> {
    let mut body = swap.header.body;
    if let Some(bytes) = &keyring {
        body.keyring_hash = p::h("keyring-blob", bytes);
    }
    if let Some(bytes) = &envelope {
        body.envelope_hash = p::h("envelope-blob", bytes);
    }
    swap.header = p::sign_object(body, &context.identity.keys.obj_sk, "manifest")?;
    swap.keyring = keyring;
    swap.envelope = envelope;
    Ok(swap)
}

pub fn commit(context: &IAdminContext<'_>, swap: &p::ISwap) -> Result<()> {
    context
        .client
        .request_bytes("/v1/swap", "POST", &p::encode(swap)?)?;
    let history = read_history(&context.client, &context.vault_id, None)?;
    let hash = p::object_hash(&swap.header, "manifest")?;
    if !history
        .headers
        .iter()
        .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == hash))
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Server did not commit the requested swap",
        ));
    }
    accept(context, swap, &history)
}

pub fn accept(context: &IAdminContext<'_>, swap: &p::ISwap, history: &IVaultHistory) -> Result<()> {
    let server = context
        .local
        .get("server")
        .filter(|v| !v.is_null())
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Missing server configuration"))?;
    let mut options = context.client.options.clone();
    options.address = server["address"].as_str().unwrap_or_default().into();
    options.pin = history.state.server_pin;
    let client = crate::client::create_client(options);
    let hash = p::object_hash(
        history
            .headers
            .last()
            .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing manifest history"))?,
        "manifest",
    )?;
    crate::onboarding::accept::accept(
        context.adapters,
        &client,
        &context.identity,
        history,
        &hash,
    )?;
    if let Some(envelope) = &swap.envelope {
        atomic_write(
            &context.adapters.home.join("state/envelope.bin"),
            envelope,
            (context.adapters.now)(),
        )?;
    }
    Ok(())
}
