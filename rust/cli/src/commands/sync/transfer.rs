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
    let options = sync_options(invocation, adapters);
    let unlock = options.unlock.clone();
    let result = sync_with_unlock(
        adapters,
        options,
        Rc::new(UreqTransport),
        pushing,
        unlock.as_deref(),
    )?;
    let changed = result["changed"].as_u64().unwrap_or(0);
    let conflicts = result["conflicts"].as_u64().unwrap_or(0);
    let conflicted = transfer_conflicted(pushing, &result);
    let message = sync_text(pushing, changed, conflicts);
    if invocation.options.get("json") == Some(&true.into()) {
        print(&terminal_json(&result));
    } else if !conflicted {
        print(&message);
    }
    if conflicted {
        return Err(EnvdenError::new(ErrorCode::Conflict, message));
    }
    Ok(())
}

fn transfer_conflicted(pushing: bool, result: &serde_json::Value) -> bool {
    result["conflicts"].as_u64().unwrap_or(0) > 0 || (pushing && result["kind"] == "conflict")
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
    fn push_conflict_kind_is_an_error_even_with_zero_conflicts() {
        let result = serde_json::json!({"kind":"conflict", "conflicts":0});
        assert!(transfer_conflicted(true, &result));
        assert!(!transfer_conflicted(false, &result));
    }

    #[test]
    fn unlock_retry_label() {
        assert_eq!(
            crate::sync::command::unlock_prompt(false),
            "Master password"
        );
        assert_eq!(
            crate::sync::command::unlock_prompt(true),
            "Wrong master password. Try again"
        );
    }

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
