use crate::{
    admin::shared::context::IAdminContext,
    session::record_unlock_window,
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
    let mut local = context.local.clone();
    record_unlock_window(&context.client, &mut local)?;
    let material = crate::vault::join::checkpoint_material(context.adapters, &local)?;
    let mut sync = crate::sync::remote::context::ISyncContext {
        adapters: context.adapters,
        options: crate::sync::remote::context::ISyncOptions {
            now: || 0,
            cwd: None,
            all: false,
            yes: false,
            interactive: false,
            choose: None,
            confirm: None,
            report: None,
        },
        state: local,
        skipped_roots: Default::default(),
        identity: context.identity.clone(),
        vault_id: context.vault_id,
        client: crate::client::create_client(context.client.options.clone()),
        headers: material.headers,
        entries: material.entries,
        keys: material.keys,
        checkpoint: material.checkpoint,
    };
    crate::sync::remote::accept::accept_head(
        &mut sync,
        Some(IVaultHistory {
            entries: history.entries.clone(),
            headers: history.headers.clone(),
            state: history.state.clone(),
            states: history.states.clone(),
        }),
        false,
    )?;
    crate::sync::remote::persist::persist_checkpoint(&mut sync)?;
    if let Some(envelope) = &swap.envelope {
        atomic_write(
            &context.adapters.home.join("state/envelope.bin"),
            envelope,
            (context.adapters.now)(),
        )?;
    }
    Ok(())
}
