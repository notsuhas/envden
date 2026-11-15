use crate::{
    adapters::IAdapters,
    output::{print, terminal_json},
    program::IInvocation,
    settings::read_config,
    sync::{
        local::conflicts::{conflict_records, render::conflicts_text},
        resolve::resolve_conflict,
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{
    io::{self, IsTerminal},
    path::Path,
};

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let flag = |key| invocation.options.get(key) == Some(&true.into());
    if flag("list") {
        let records = conflict_records(&adapters.home)?;
        print(&if flag("json") {
            terminal_json(&serde_json::to_value(records).unwrap())
        } else {
            conflicts_text(&records)
        });
        return Ok(());
    }
    if (flag("keepMine") || flag("takeServer"))
        && !io::stdin().is_terminal()
        && read_config(&adapters.home)?["agent-merge"] != true
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Resolution requires a terminal; use --list, or config agent-merge on before --keep-mine/--take-server",
        ));
    }
    let choice = if flag("keepMine") {
        "keep-mine"
    } else if flag("takeServer") {
        "take-server"
    } else {
        "edit"
    };
    let result = resolve_conflict(
        adapters,
        invocation.arguments.first().map(String::as_str),
        invocation
            .options
            .get("repo")
            .and_then(|v| v.as_str())
            .map(Path::new),
        choice,
        &std::env::current_dir().map_err(crate::state::files::failure)?,
    )?;
    print(&if flag("json") {
        terminal_json(&result)
    } else {
        format!(
            "Resolved {}{}",
            result["path"].as_str().unwrap_or_default(),
            if result["preserved"]
                .as_array()
                .is_some_and(|p| !p.is_empty())
            {
                format!(
                    "\nBackups saved in {}",
                    result["backups"].as_str().unwrap_or_default()
                )
            } else {
                String::new()
            }
        )
    });
    Ok(())
}
