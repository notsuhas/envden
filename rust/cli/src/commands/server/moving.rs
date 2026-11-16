use super::token::read_token;
use crate::{
    adapters::IAdapters,
    admin::r#move::{
        run::{IMoveOptions, move_server},
        switch::switch_server,
    },
    client::UreqTransport,
    onboarding::require_server_address,
    output::{print, prompts::secret},
    program::IInvocation,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::TTokenKind;
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let server = invocation.arguments.first();
    if invocation.command.name == "switch" {
        use std::io::IsTerminal;

        let unlock = |client: &crate::client::IClient, vault: &[u8; 32]| {
            crate::session::login(
                client,
                vault,
                crate::session::TPassword::Prompt(&mut |retry| {
                    secret(crate::sync::command::unlock_prompt(retry), |_| None)
                }),
                envden_protocol::protocol::TLoginPurpose::Unlock,
            )
        };
        switch_server(
            adapters,
            server.map(String::as_str).unwrap_or(""),
            Rc::new(UreqTransport),
            std::io::stdin()
                .is_terminal()
                .then_some(&unlock as crate::admin::r#move::switch::TUnlock<'_>),
        )?;
        print("Server switched");
        return Ok(());
    }
    let flag = |key| {
        invocation
            .options
            .get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    };
    let resume = flag("resume");
    let abort = flag("abort");
    if server.is_none() && !resume && !abort {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Give the destination server address, or --resume or --abort for an unfinished move",
        ));
    }
    let address = server.map(|s| require_server_address(s)).transpose()?;
    let setup = invocation
        .options
        .get("setupToken")
        .and_then(|v| v.as_str());
    let token = if resume || abort {
        setup.map(str::to_string)
    } else {
        Some(read_token(TTokenKind::Setup, setup)?)
    };
    let password = secret("Master password", |_| None)?;
    move_server(
        adapters,
        &IMoveOptions {
            address: address.as_deref(),
            token: token.as_deref(),
            resume,
            abort,
            password: &password,
        },
        Rc::new(UreqTransport),
    )?;
    print("Move complete");
    Ok(())
}
