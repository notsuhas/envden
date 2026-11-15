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
    crate::state::lock::with_state_lock(
        &adapters.home.join("state/update"),
        (adapters.now)(),
        || update(adapters, fetcher),
    )
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
    let stream = if inherit {
        TStdio::Inherit
    } else {
        TStdio::Ignore
    };
    exec_trusted(
        &path.to_string_lossy(),
        &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        &ISpawnOptions {
            stdin: Some(stream.clone()),
            stdout: Some(stream.clone()),
            stderr: Some(stream),
            env: [
                "ENVDEN_HOME",
                "ENVDEN_NO_UPDATE_CHECK",
                "ENVDEN_TELEMETRY",
                "DO_NOT_TRACK",
            ]
            .into_iter()
            .filter_map(|key| std::env::var(key).ok().map(|v| (key.into(), Some(v))))
            .collect(),
            ..Default::default()
        },
    )
    .map(|_| ())
}
