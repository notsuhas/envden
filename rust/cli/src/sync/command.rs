use super::remote::context::ISyncOptions;
use crate::{
    adapters::IAdapters,
    output::{
        print,
        prompts::{choose, consent},
    },
    program::IInvocation,
};
use std::{
    io::{self, IsTerminal},
    rc::Rc,
};

pub fn sync_options(invocation: &IInvocation<'_>, adapters: &IAdapters) -> ISyncOptions {
    let json = invocation.options.get("json") == Some(&true.into());
    ISyncOptions {
        unlock: Some(Rc::new(|client, vault| {
            crate::session::login(
                client,
                vault,
                crate::session::TPassword::Prompt(&mut |retry| {
                    crate::output::prompts::secret(unlock_prompt(retry), |_| None)
                }),
                envden_protocol::protocol::TLoginPurpose::Unlock,
            )
            .map(|_| ())
        })),
        now: std::rc::Rc::new(adapters.now),
        cwd: std::env::current_dir().ok(),
        all: invocation.options.get("all") == Some(&true.into()),
        yes: invocation.options.get("yes") == Some(&true.into()),
        interactive: io::stdin().is_terminal(),
        confirm: Some(Rc::new(|keys| {
            consent(&format!("Merge changes to {}?", keys.join(", ")), true)
        })),
        choose: Some(Rc::new(|path| {
            choose(
                &format!("Detached file: {}", crate::output::sanitize_terminal(path)),
                &[
                    ("keep-mine".into(), "Keep mine".into()),
                    ("take-server".into(), "Take server".into()),
                    ("merge".into(), "Merge".into()),
                ],
                None,
            )
        })),
        report: Some(Rc::new(move |message| {
            if !json {
                print(message);
            }
        })),
    }
}

pub(crate) fn unlock_prompt(retry: bool) -> &'static str {
    if retry {
        "Wrong master password. Try again"
    } else {
        "Master password"
    }
}
