use super::output::replacement_output;
use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, prompts::secret},
    program::IInvocation,
    vault::admin::{credentials, devices},
};
use envden_core::errors::Result;
use std::{
    io::{self, IsTerminal},
    rc::Rc,
};

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let action = invocation.command.path.last().expect("command").as_str();
    let transport = Rc::new(UreqTransport);
    match action {
        "replace" => {
            let mut output = replacement_output(
                adapters,
                invocation
                    .options
                    .get("kitOut")
                    .and_then(serde_json::Value::as_str),
            );
            let password = secret("Master password", |_| None)?;
            let finished = credentials::replace(adapters, &password, transport, None, &mut |kit| {
                output.show(kit)
            })
            .inspect_err(|_| output.fail())?;
            print(if finished {
                "Finished an interrupted kit replacement; the kit it showed is now active. Run again for another kit."
            } else {
                "Recovery kit replaced; the old kit no longer works"
            });
        }
        "rotate" => {
            devices::rotate(adapters, &secret("Master password", |_| None)?, transport)?;
            print("Vault re-keyed; removed devices can't read new changes");
        }
        "change" | "reset" => {
            let old = if action == "change" {
                Some(secret("Old master password", |_| None)?)
            } else {
                None
            };
            let new = crate::onboarding::confirmed_password(
                |label| secret(label, |_| None),
                if io::stdin().is_terminal() { 3 } else { 1 },
                |message| eprintln!("{message}"),
            )?;
            let kit = secret("Recovery secret key", |_| None)?;
            if let Some(old) = old {
                credentials::change(adapters, &old, &new, &kit, transport)?;
                print("Password changed; the kit stays valid");
            } else {
                credentials::reset(adapters, &new, &kit, transport)?;
                print("Password reset; the kit stays valid");
            }
        }
        _ => unreachable!(),
    }
    Ok(())
}
