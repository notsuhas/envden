use super::{generate::service_definition, location::service_file};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::path::{Path, PathBuf};

pub trait IServiceEffects {
    fn write(&mut self, path: &Path, bytes: &[u8], now: u64) -> Result<()>;
    fn run(&mut self, args: &[String]) -> Result<()>;
    fn pause(&mut self, milliseconds: u64);
}

pub struct IHostService<'a> {
    pub platform: &'a str,
    pub executable: &'a str,
    pub user_home: &'a Path,
    pub home: &'a Path,
    pub port: u16,
    pub uid: u32,
}

pub struct IInstalledService {
    pub log: PathBuf,
    pub path: PathBuf,
}

pub fn install_host_service(
    options: &IHostService<'_>,
    effects: &mut dyn IServiceEffects,
    now: u64,
) -> Result<IInstalledService> {
    let log = options.home.join("server.log");
    let definition = service_definition(
        options.platform,
        options.executable,
        &options.home.join("server").to_string_lossy(),
        &log.to_string_lossy(),
        options.port,
    )?;
    let path =
        service_file(options.platform, options.user_home, options.home).ok_or_else(|| {
            EnvdenError::new(
                ErrorCode::NotImplemented,
                "Login services are unsupported on this platform",
            )
        })?;
    let command = |args: &[&str]| args.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let path_text = path.to_string_lossy();
    match definition.kind {
        "launchd" => {
            effects.write(&path, definition.content.as_bytes(), now)?;
            let gui = format!("gui/{}", options.uid);
            let _ = effects.run(&command(&[
                "launchctl",
                "bootout",
                &format!("{gui}/com.envden.server"),
            ]));
            for attempt in 1..=10 {
                match effects.run(&command(&["launchctl", "bootstrap", &gui, &path_text])) {
                    Ok(()) => break,
                    Err(e) if attempt == 10 => return Err(e),
                    Err(_) => effects.pause(300),
                }
            }
        }
        "systemd" => {
            effects.write(&path, definition.content.as_bytes(), now)?;
            for args in [
                ["systemctl", "--user", "daemon-reload"].as_slice(),
                ["systemctl", "--user", "enable", "envden.service"].as_slice(),
                ["systemctl", "--user", "restart", "envden.service"].as_slice(),
            ] {
                effects.run(&command(args))?;
            }
        }
        _ => {
            let bytes = definition
                .content
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>();
            effects.write(&path, &bytes, now)?;
            let _ = effects.run(&command(&["schtasks", "/End", "/TN", "envden"]));
            effects.run(&command(&[
                "schtasks", "/Create", "/TN", "envden", "/XML", &path_text, "/F",
            ]))?;
            effects.run(&command(&["schtasks", "/Run", "/TN", "envden"]))?;
        }
    }
    Ok(IInstalledService { log, path })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct Effects {
        writes: Vec<(PathBuf, Vec<u8>)>,
        commands: Vec<Vec<String>>,
        busy: usize,
        pauses: usize,
    }
    impl IServiceEffects for Effects {
        fn write(&mut self, path: &Path, bytes: &[u8], _: u64) -> Result<()> {
            self.writes.push((path.into(), bytes.into()));
            Ok(())
        }
        fn run(&mut self, args: &[String]) -> Result<()> {
            self.commands.push(args.to_vec());
            if args[1] == "bootstrap" && self.busy > 0 {
                self.busy -= 1;
                return Err(EnvdenError::new(ErrorCode::Internal, "Busy"));
            }
            Ok(())
        }
        fn pause(&mut self, ms: u64) {
            assert_eq!(ms, 300);
            self.pauses += 1;
        }
    }
    #[test]
    fn injected_effects_and_bootstrap_retries() {
        for platform in ["linux", "darwin", "win32"] {
            let mut effects = Effects {
                busy: 2,
                ..Default::default()
            };
            let options = IHostService {
                platform,
                executable: "/bin/envden",
                user_home: Path::new("/test"),
                home: Path::new("/test/envden"),
                port: 4783,
                uid: 1,
            };
            let installed = install_host_service(&options, &mut effects, 1).unwrap();
            assert_eq!(effects.writes[0].0, installed.path);
            match platform {
                "darwin" => {
                    assert_eq!(effects.commands[0][1], "bootout");
                    assert_eq!(effects.pauses, 2);
                }
                "win32" => {
                    assert_eq!(effects.commands[0][1], "/End");
                    assert_eq!(effects.writes[0].1[1], 0);
                }
                _ => assert_eq!(
                    effects
                        .commands
                        .iter()
                        .map(|a| a[2].as_str())
                        .collect::<Vec<_>>(),
                    vec!["daemon-reload", "enable", "restart"]
                ),
            }
        }
    }
}
