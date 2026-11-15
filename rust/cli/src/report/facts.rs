use super::content::{
    arguments::mask_arguments, document::IReportFacts, failure::describe_failure,
};
use crate::{
    adapters::IAdapters,
    agent::service::location::service_file,
    updates::self_update::install::{TInstallMethod, install_method},
    version::VERSION,
};
use envden_core::errors::EnvdenError;
use std::{fs, path::Path};

pub fn report_facts(adapters: &IAdapters, error: &EnvdenError, argv: &[String]) -> IReportFacts {
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
        v => v,
    };
    let release =
        envden_core::process::exec_trusted_sync("uname", &["-r".into()], &Default::default())
            .unwrap_or_default();
    let install = match install_method(
        &adapters.home,
        None,
        &adapters.executable,
        std::env::var("ENVDEN_INSTALL_METHOD").ok().as_deref(),
    ) {
        Ok(TInstallMethod::Script) => "script".into(),
        Ok(TInstallMethod::Manager(args)) => args[0].clone(),
        Err(_) => "unknown".into(),
    };
    let mut files = vec![
        adapters
            .home
            .join("server.log")
            .to_string_lossy()
            .into_owned(),
        format!(
            "{}{sep}",
            adapters.home.join("state").display(),
            sep = std::path::MAIN_SEPARATOR
        ),
        adapters
            .home
            .join("config.json")
            .to_string_lossy()
            .into_owned(),
    ];
    if let Some(service) = service_file(platform, &adapters.user_home, &adapters.home) {
        files.push(service.to_string_lossy().into_owned());
    }
    IReportFacts {
        version: VERSION.into(),
        os: format!("{platform} {}", release.trim()),
        arch: arch.into(),
        install,
        args: mask_arguments(argv),
        failure: describe_failure(error),
        server_log: log_tail(&adapters.home.join("server.log")),
        files: files
            .into_iter()
            .map(|path| {
                let exists = fs::symlink_metadata(&path).is_ok();
                (path, exists)
            })
            .collect(),
        user_home: adapters.user_home.to_string_lossy().into_owned(),
    }
}

fn log_tail(path: &Path) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let info = fs::symlink_metadata(path).ok()?;
    if !info.is_file() {
        return None;
    }
    let mut file = fs::File::open(path).ok()?;
    file.seek(SeekFrom::Start(info.len().saturating_sub(64 * 1024)))
        .ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}
