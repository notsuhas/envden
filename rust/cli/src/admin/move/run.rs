use super::{
    abort::{abort_move, remove},
    credentials::move_credentials,
    resume::resume_move_address,
    switch::switch_server,
};
use crate::{
    adapters::IAdapters,
    admin::shared::{
        context::{IAdminContext, admin_context},
        history::current_history,
        swap::admin_swap,
        transfer::copy_server,
    },
    client::{IClient, ITransport, create_client, hello, text},
    session::{TPassword, login, register_password},
    state::{
        files::{atomic_write, failure, optional_read},
        lock::with_state_lock,
    },
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::{fs, path::Path, rc::Rc};

pub struct IMoveOptions<'a> {
    pub address: Option<&'a str>,
    pub token: Option<&'a str>,
    pub resume: bool,
    pub abort: bool,
    pub password: &'a str,
}

pub fn move_server(
    adapters: &IAdapters,
    options: &IMoveOptions<'_>,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, (adapters.now)(), || {
        let context = admin_context(adapters, transport.clone())?;
        login(
            &context.client,
            &context.vault_id,
            TPassword::Fixed(options.password),
            p::TLoginPurpose::Unlock,
        )?;
        let directory = adapters.home.join("state");
        let saved_address = optional_read(&directory.join("move-address"))?;
        let mut address = options.address.map(str::to_string).or(saved_address);
        if options.abort {
            return abort_move(&context, &directory, address.as_deref());
        }
        if address.as_deref().is_none_or(str::is_empty) && options.resume {
            address = resume_move_address(&context, &directory)?;
        }
        let address = address.filter(|s| !s.is_empty()).ok_or_else(|| {
            EnvdenError::new(ErrorCode::InvalidInput, "Specify the destination server")
        })?;
        let credentials = move_credentials(adapters, &directory, options.token)?;
        hello(&address, Some(&credentials.pin), &*transport, MIN_SERVER)?;
        let mut client_options = context.client.options.clone();
        client_options.address = address.clone();
        client_options.pin = credentials.pin;
        if let Some((secret, _)) = credentials.token {
            client_options.proof = Some(Rc::new(move |request| {
                p::token_proof(
                    p::TTokenKind::Setup,
                    &p::token_key(p::TTokenKind::Setup, &secret),
                    request,
                )
                .map(|b| b.to_vec())
            }));
        }
        let destination = create_client(client_options);
        atomic_write(
            &directory.join("move-address"),
            address.as_bytes(),
            (adapters.now)(),
        )?;
        atomic_write(
            &directory.join("move-pin"),
            text(&credentials.pin).as_bytes(),
            (adapters.now)(),
        )?;
        let swap = prepared_swap(
            &context,
            &destination,
            &directory,
            credentials.pin,
            &address,
            options.password,
        )?;
        require_destination(
            swap.entries.first().map(|e| &e.body.change),
            &credentials.pin,
            &address,
        )?;
        let bytes = p::encode(&swap)?;
        context.client.request_bytes("/v1/swap", "POST", &bytes)?;
        destination.request_bytes("/v1/swap", "POST", &bytes)?;
        login(
            &destination,
            &context.vault_id,
            TPassword::Fixed(options.password),
            p::TLoginPurpose::Unlock,
        )?;
        switch_server(adapters, &address, transport)?;
        for name in ["move-swap.bin", "move-address", "move-pin"] {
            remove(&directory.join(name))?;
        }
        adapters.keychain.delete(&credentials.token_slot)
    })
}

fn prepared_swap(
    context: &IAdminContext<'_>,
    destination: &IClient,
    directory: &Path,
    pin: [u8; 32],
    address: &str,
    password: &str,
) -> Result<p::ISwap> {
    match fs::read(directory.join("move-swap.bin")) {
        Ok(bytes) => return p::decode(&bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(failure(e)),
    }
    context.client.request("/v1/move/sk-pub", "GET", None)?;
    destination.request("/v1/move/session", "POST", None)?;
    context.client.request("/v1/move/freeze", "POST", None)?;
    let history = current_history(context)?;
    copy_server(&context.client, destination, &history)?;
    register_password(destination, &context.vault_id, password)?;
    let entry = p::sign_object(
        p::TEntry {
            vault_id: context.vault_id,
            seq: history.state.seq + 1,
            parent: history.state.head,
            change: p::TEntryPayload::ServerMoved(p::IServerMoved {
                old_pin: history.state.server_pin,
                new_pin: pin,
                new_address: address.into(),
            }),
            signer: context.identity.record.id,
        },
        &context.identity.keys.obj_sk,
        "entry",
    )?;
    let swap = admin_swap(
        &history,
        &context.identity,
        10,
        (context.adapters.now)(),
        vec![entry],
    )?;
    atomic_write(
        &directory.join("move-swap.bin"),
        &p::encode(&swap)?,
        (context.adapters.now)(),
    )?;
    Ok(swap)
}

fn require_destination(
    entry: Option<&p::TEntryPayload>,
    pin: &[u8; 32],
    address: &str,
) -> Result<()> {
    if matches!(entry,Some(p::TEntryPayload::ServerMoved(m)) if m.new_pin == *pin && m.new_address == address)
    {
        return Ok(());
    }
    Err(EnvdenError::new(
        ErrorCode::InvalidInput,
        "Resume destination differs from the stored move",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resume_destination_must_match_saved_move() {
        let entry = p::TEntryPayload::ServerMoved(p::IServerMoved {
            old_pin: [1; 32],
            new_pin: [2; 32],
            new_address: "http://destination".into(),
        });
        assert!(require_destination(Some(&entry), &[2; 32], "http://destination").is_ok());
        assert!(require_destination(Some(&entry), &[3; 32], "http://destination").is_err());
        assert!(require_destination(Some(&entry), &[2; 32], "http://other").is_err());
        assert!(require_destination(None, &[2; 32], "http://destination").is_err());
    }
}
