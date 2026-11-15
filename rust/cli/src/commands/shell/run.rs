use crate::{adapters::IAdapters, output::prompts::choose, program::IInvocation};
use envden_adapter_shell_rc::TShell;
use envden_core::errors::Result;

pub fn run(action: &str, invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let shell = match invocation.arguments.first() {
        Some(shell) => shell.clone(),
        None => choose(
            "Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull",
            &[
                ("zsh", "zsh"),
                ("bash", "bash"),
                ("fish", "fish"),
                ("powershell", "PowerShell"),
                ("none", "No, skip it"),
            ]
            .map(|(value, label)| (value.into(), label.into())),
            None,
        )?,
    };
    let shell = match shell.as_str() {
        "zsh" => TShell::Zsh,
        "bash" => TShell::Bash,
        "fish" => TShell::Fish,
        "powershell" => TShell::Powershell,
        _ => return Ok(()),
    };
    let adapter = adapters.shell(shell);
    if action == "install" {
        adapter.install(&adapters.executable.to_string_lossy())
    } else {
        adapter.uninstall()
    }
}
