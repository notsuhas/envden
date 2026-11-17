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
        refresh((adapters.host_server)(adapters, port));
    }
    for shell in [TShell::Zsh, TShell::Bash, TShell::Fish, TShell::Powershell] {
        let adapter = adapters.shell(shell);
        refresh(adapter.installed().and_then(|installed| {
            if installed {
                adapter.install(&adapters.executable.to_string_lossy())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_passes_the_original_executable_to_installed_shells() {
        let temp = tempfile::tempdir().unwrap();
        let mut adapters = crate::adapters::create_adapters(
            Some(temp.path().join("envden")),
            temp.path().to_owned(),
            || 1,
        );
        adapters.executable = "/opt/homebrew/Cellar/envden/1/bin/envden".into();
        let shell = adapters.shell(TShell::Zsh);
        shell
            .install(&adapters.executable.to_string_lossy())
            .unwrap();
        let rc = temp.path().join(".zshrc");
        let before = std::fs::read_to_string(&rc).unwrap();
        refresh_installation(&adapters);
        assert_eq!(std::fs::read_to_string(rc).unwrap(), before);
    }

    #[test]
    fn refresh_uses_supplied_host_service() {
        use std::sync::{Arc, Mutex};

        let dir = tempfile::tempdir().unwrap();
        let mut adapters = crate::adapters::create_adapters(
            Some(dir.path().join("envden")),
            dir.path().into(),
            || 1,
        );
        let platform = if cfg!(target_os = "macos") {
            "darwin"
        } else if cfg!(windows) {
            "win32"
        } else {
            "linux"
        };
        let path = crate::agent::service::location::service_file(
            platform,
            &adapters.user_home,
            &adapters.home,
        )
        .unwrap();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let definition = "envden server --port 54321";
        let bytes = if cfg!(windows) {
            definition
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect()
        } else {
            definition.as_bytes().to_vec()
        };
        std::fs::write(path, bytes).unwrap();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let observed = calls.clone();
        adapters.host_server = Arc::new(move |_, port| {
            observed.lock().unwrap().push(port);
            Ok(())
        });
        refresh_installation(&adapters);
        assert_eq!(*calls.lock().unwrap(), [54321]);
    }
}
