use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    history::{
        list::{
            render::{changes_text, history_text},
            run::file_history,
        },
        restore::run::restore,
    },
    output::{print, terminal_json},
    program::IInvocation,
    sync::command::sync_options,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let file = invocation.arguments.first().map(String::as_str);
    let version = invocation.options.get("restore").and_then(|v| {
        v.as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .or_else(|| v.as_u64())
    });
    let result = if let Some(version) = version {
        let file = file.ok_or_else(|| {
            EnvdenError::new(ErrorCode::InvalidInput, "Name the env file to restore")
        })?;
        restore(
            adapters,
            sync_options(invocation, adapters),
            Rc::new(UreqTransport),
            file,
            version,
        )?
    } else {
        file_history(
            adapters,
            sync_options(invocation, adapters),
            Rc::new(UreqTransport),
            file,
        )?
    };
    let text = if invocation.options.get("json") == Some(&true.into()) {
        terminal_json(&result)
    } else if version.is_none() {
        history_text(&result, (adapters.now)())?
    } else {
        let path = result["path"].as_str().unwrap_or_default();
        let version = result["version"].as_u64().unwrap_or_default();
        match result["kind"].as_str() {
            Some("cancelled") => "Restore cancelled".into(),
            Some("unchanged") => format!("{path} already matches version {version}"),
            _ => format!(
                "Restored {path} to version {version} as a local edit: {}\nReview it with envden diff, then run envden push to publish it",
                changes_text(&result["changes"])
            ),
        }
    };
    print(&text);
    Ok(())
}
