use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, terminal_json},
    program::IInvocation,
    sync::{command::sync_options, engine::sync_with_unlock},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let pushing = invocation.command.name == "push";
    let result = sync_with_unlock(
        adapters,
        sync_options(invocation, adapters),
        Rc::new(UreqTransport),
        pushing,
        Some(&|client, vault_id| {
            crate::session::login(
                client,
                vault_id,
                crate::session::TPassword::Prompt(&mut |_| {
                    crate::output::prompts::secret("Master password", |_| None)
                }),
                envden_protocol::protocol::TLoginPurpose::Unlock,
            )
            .map(|_| ())
        }),
    )?;
    let changed = result["changed"].as_u64().unwrap_or(0);
    let conflicts = result["conflicts"].as_u64().unwrap_or(0);
    let message = sync_text(pushing, changed, conflicts);
    if invocation.options.get("json") == Some(&true.into()) {
        print(&terminal_json(&result));
    } else if conflicts == 0 {
        print(&message);
    }
    if conflicts > 0 {
        return Err(EnvdenError::new(ErrorCode::Conflict, message));
    }
    Ok(())
}

fn sync_text(pushing: bool, changed: u64, conflicts: u64) -> String {
    let verb = if pushing { "Pushed" } else { "Pulled" };
    let moved = (changed > 0).then(|| {
        format!(
            "{verb} {changed} file{}",
            if changed == 1 { "" } else { "s" }
        )
    });
    if conflicts == 0 {
        return moved.unwrap_or_else(|| {
            if pushing {
                "Nothing to push".into()
            } else {
                "Up to date".into()
            }
        });
    }
    let pending = format!(
        "{conflicts} conflict{} to resolve",
        if conflicts == 1 { "" } else { "s" }
    );
    moved.map_or_else(
        || format!("{pending}; nothing {}", verb.to_lowercase()),
        |m| format!("{m}; {pending}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_summaries() {
        assert_eq!(sync_text(true, 0, 0), "Nothing to push");
        assert_eq!(sync_text(false, 0, 0), "Up to date");
        assert_eq!(
            sync_text(false, 1, 1),
            "Pulled 1 file; 1 conflict to resolve"
        );
        assert_eq!(
            sync_text(true, 0, 2),
            "2 conflicts to resolve; nothing pushed"
        );
    }
}
