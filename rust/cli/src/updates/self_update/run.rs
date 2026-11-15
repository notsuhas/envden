use super::{
    install::{TInstallMethod, install_method},
    paths::release_platform,
    replace::replace_binary,
};
use crate::{
    adapters::IAdapters,
    updates::{download::download_update, fetch::IFetcher},
    version::VERSION,
};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, TStdio, exec_trusted},
};
use serde_json::{Value, json};
use std::{path::Path, time::Duration};

pub fn self_update(adapters: &IAdapters, fetcher: &dyn IFetcher) -> Result<Value> {
    super::lock::with_update_lock(&adapters.home, &adapters.now, || update(adapters, fetcher))
}

fn update(adapters: &IAdapters, fetcher: &dyn IFetcher) -> Result<Value> {
    let binary = &adapters.executable;
    match install_method(
        &adapters.home,
        None,
        binary,
        std::env::var("ENVDEN_INSTALL_METHOD").ok().as_deref(),
    )? {
        TInstallMethod::Manager(command) => {
            return super::execute::manager_update(
                &command,
                &binary.to_string_lossy(),
                (adapters.now)(),
            );
        }
        TInstallMethod::Script => {}
    }
    if matches!(
        binary.file_name().and_then(|s| s.to_str()),
        Some("bun" | "node" | "bun.exe" | "node.exe")
    ) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Self-update requires the installed envden binary",
        ));
    }
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "win32"
    } else {
        std::env::consts::OS
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        a => a,
    };
    let glibc = if cfg!(target_env = "gnu") {
        Some("glibc")
    } else {
        None
    };
    let Some(bytes) = download_update(
        fetcher,
        VERSION,
        &release_platform(platform, arch, glibc),
        Duration::from_secs(1800),
    )?
    else {
        return Ok(json!({"kind":"current"}));
    };
    replace_binary(
        binary,
        &bytes,
        cfg!(windows),
        |path| run_binary(path, &["--version"], false),
        || run_binary(binary, &["update", "--post-install"], true),
        (adapters.now)(),
    )?;
    Ok(json!({"kind":"updated"}))
}

fn run_binary(path: &Path, args: &[&str], inherit: bool) -> Result<()> {
    if inherit {
        return super::execute::post_install(&path.to_string_lossy(), None);
    }

    exec_trusted(
        &path.to_string_lossy(),
        &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        &ISpawnOptions {
            stdin: Some(TStdio::Ignore),
            stdout: Some(TStdio::Ignore),
            stderr: Some(TStdio::Ignore),
            ..Default::default()
        },
    )
    .map(|_| ())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn failed_post_install_uses_update_command_error() {
        let error = run_binary(
            Path::new("/usr/bin/false"),
            &["update", "--post-install"],
            true,
        )
        .unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidInput);
        assert_eq!(error.message, "Update command failed");
    }
}
