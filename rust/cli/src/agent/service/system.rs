use super::install::{IHostService, IInstalledService, IServiceEffects, install_host_service};
use crate::{
    adapters::IAdapters, agent::write_through::write_through, state::files::failure,
    updates::self_update::paths::stable_executable,
};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, TStdio, spawn_trusted},
};
use std::path::Path;

struct Effects;
impl IServiceEffects for Effects {
    fn write(&mut self, path: &Path, bytes: &[u8], now: u64) -> Result<()> {
        write_through(path, bytes, now)
    }
    fn run(&mut self, args: &[String]) -> Result<()> {
        let output = spawn_trusted(
            &args[0],
            &args[1..],
            &ISpawnOptions {
                stdout: Some(TStdio::Ignore),
                ..Default::default()
            },
        )?
        .wait_with_output()
        .map_err(failure)?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr)
            .trim()
            .chars()
            .take(300)
            .collect::<String>();
        let detail = if stderr.is_empty() {
            format!("{} exited {}", args[0], output.status.code().unwrap_or(1))
        } else {
            stderr
        };
        Err(EnvdenError::new(
            ErrorCode::Internal,
            format!("Could not start the envden server service: {detail}"),
        ))
    }
    fn pause(&mut self, milliseconds: u64) {
        std::thread::sleep(std::time::Duration::from_millis(milliseconds));
    }
}

pub fn host_server(adapters: &IAdapters, port: u16) -> Result<IInstalledService> {
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(windows) {
        "win32"
    } else {
        std::env::consts::OS
    };
    let uid = if cfg!(unix) {
        let output = envden_core::process::exec_trusted("id", &["-u".into()], &Default::default())?;
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u32>()
            .unwrap_or(0)
    } else {
        0
    };
    install_host_service(
        &IHostService {
            platform,
            executable: &stable_executable(&adapters.executable.to_string_lossy()),
            user_home: &adapters.user_home,
            home: &adapters.home,
            port,
            uid,
        },
        &mut Effects,
        (adapters.now)(),
    )
}
