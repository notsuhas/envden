use crate::{adapters::IAdapters, agent::install::install_agent};
use envden_adapter_shell_rc::TShell;

pub fn refresh_installation(adapters: &IAdapters) {
    if adapters
        .user_home
        .join(".agents/skills/envden/SKILL.md")
        .exists()
    {
        refresh(install_agent(&adapters.user_home, (adapters.now)()));
    }
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "win32"
    } else {
        std::env::consts::OS
    };
    if crate::agent::service::location::service_file(platform, &adapters.user_home, &adapters.home)
        .is_some_and(|p| p.exists())
    {
        let port = crate::agent::service::port::installed_service_port(
            platform,
            &adapters.user_home,
            &adapters.home,
        )
        .unwrap_or(crate::agent::service::port::DEFAULT_SERVER_PORT);
        refresh(crate::agent::service::system::host_server(adapters, port).map(|_| ()));
    }
    for shell in [TShell::Zsh, TShell::Bash, TShell::Fish, TShell::Powershell] {
        let adapter = adapters.shell(shell);
        refresh(adapter.installed().and_then(|installed| {
            if installed {
                adapter.install(&super::self_update::paths::stable_executable(
                    &adapters.executable.to_string_lossy(),
                ))
            } else {
                Ok(())
            }
        }));
    }
}

fn refresh(result: envden_core::errors::Result<()>) {
    if result.is_err() {
        eprintln!("envden: binary updated; optional installation refresh failed");
    }
}
