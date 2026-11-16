use crate::{
    adapters::IAdapters,
    output::prompts::{choose, consent},
    settings::{read_config, set_config},
};
use envden_core::errors::Result;
use serde_json::Value;
use std::io::{self, IsTerminal};

pub(super) fn preferences(adapters: &IAdapters, options: &Value, existing: bool) -> Result<()> {
    let config = read_config(&adapters.home)?;
    let unattended = existing || options["yes"] == true || !io::stdin().is_terminal();
    for (key, option, fallback, question, initial) in [
        (
            "telemetry",
            "telemetry",
            false,
            "Enable anonymous telemetry?",
            true,
        ),
        (
            "update-check",
            "updateCheck",
            true,
            "Check for updates daily?",
            true,
        ),
    ] {
        let value = match options[option].as_str() {
            Some(value) => value == "on",
            None if existing => config[key].as_bool().unwrap_or(fallback),
            None if unattended => fallback,
            None => consent(question, initial)?,
        };
        set_config(
            key,
            if value { "on" } else { "off" },
            &adapters.home,
            &adapters.now,
            io::stdin().is_terminal(),
        )?;
    }
    let shell = match options["shell"].as_str() {
        Some(value) => value.to_owned(),
        None if unattended => "none".into(),
        None => choose(
            "Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull",
            &[
                ("zsh".into(), "zsh".into()),
                ("bash".into(), "bash".into()),
                ("fish".into(), "fish".into()),
                ("powershell".into(), "PowerShell".into()),
                ("none".into(), "No, skip it".into()),
            ],
            None,
        )?,
    };
    if shell != "none" {
        let shell = match shell.as_str() {
            "bash" => envden_adapter_shell_rc::TShell::Bash,
            "fish" => envden_adapter_shell_rc::TShell::Fish,
            "powershell" => envden_adapter_shell_rc::TShell::Powershell,
            _ => envden_adapter_shell_rc::TShell::Zsh,
        };
        if let Err(error) = adapters
            .shell(shell)
            .install(&adapters.executable.to_string_lossy())
        {
            eprintln!(
                "Skipped the shell notice: {}. Set it up later with: envden shell install",
                error.message
            );
        }
    }
    let agent = match options["agent"].as_str() {
        Some(value) => value == "on",
        None if unattended => false,
        None => consent(
            "Install the agent skill? It teaches AI coding agents like Claude Code and Codex to use envden safely",
            true,
        )?,
    };
    if agent
        && let Err(error) =
            crate::agent::install::install_agent(&adapters.user_home, (adapters.now)())
    {
        eprintln!(
            "Skipped the agent skill: {}. Set it up later with: envden agent install",
            error.message
        );
    }
    Ok(())
}
