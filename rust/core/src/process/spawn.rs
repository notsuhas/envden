use super::{environment::sanitized_with_directories, trust::resolve_with_directories};
use crate::errors::{EnvdenError, ErrorCode, Result};
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::PathBuf,
    process::{Command, Output, Stdio},
    sync::Arc,
};
#[derive(Debug, Clone, Default)]
pub enum TStdio {
    Inherit,
    Ignore,
    #[default]
    Pipe,
    Bytes(Vec<u8>),
}
#[derive(Debug, Clone, Default)]
pub struct ISpawnOptions {
    pub env: BTreeMap<String, Option<String>>,
    pub cwd: Option<PathBuf>,
    pub timeout: Option<u64>,
    pub manager_bin: Option<String>,
    pub stdin: Option<TStdio>,
    pub stdout: Option<TStdio>,
    pub stderr: Option<TStdio>,
}
fn stdio(value: &TStdio) -> Stdio {
    match value {
        TStdio::Inherit => Stdio::inherit(),
        TStdio::Ignore => Stdio::null(),
        _ => Stdio::piped(),
    }
}
fn failure(e: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::InvalidInput, "Subprocess failed", e)
}
pub fn spawn_trusted(
    name: &str,
    args: &[String],
    options: &ISpawnOptions,
) -> Result<ITrustedChild> {
    spawn_with_directories(name, args, options, None)
}

pub(crate) fn spawn_with_directories(
    name: &str,
    args: &[String],
    options: &ISpawnOptions,
    directories: Option<&[String]>,
) -> Result<ITrustedChild> {
    let mut command = Command::new(resolve_with_directories(name, directories)?);
    command
        .args(args)
        .env_clear()
        .envs(sanitized_with_directories(
            &options.env,
            &std::env::vars().collect(),
            options.manager_bin.as_deref(),
            directories,
        ));
    if let Some(cwd) = &options.cwd {
        command.current_dir(cwd);
    }
    command
        .stdin(stdio(options.stdin.as_ref().unwrap_or(&TStdio::Ignore)))
        .stdout(stdio(options.stdout.as_ref().unwrap_or(&TStdio::Pipe)))
        .stderr(stdio(options.stderr.as_ref().unwrap_or(&TStdio::Pipe)));
    let mut child = command.spawn().map_err(failure)?;
    if let Some(TStdio::Bytes(bytes)) = &options.stdin {
        let mut input = child.stdin.take().unwrap();
        let bytes = bytes.clone();
        std::thread::spawn(move || {
            let _ = input.write_all(&bytes);
        });
    }
    let child = Arc::new(shared_child::SharedChild::new(child).map_err(failure)?);
    if let Some(timeout) = options.timeout {
        let watched = child.clone();
        std::thread::spawn(move || {
            if let Ok(None) = watched.wait_timeout(std::time::Duration::from_millis(timeout)) {
                let _ = watched.kill();
                let _ = watched.wait();
            }
        });
    }
    Ok(ITrustedChild { child })
}
pub struct ITrustedChild {
    pub child: Arc<shared_child::SharedChild>,
}
fn read_pipe(
    pipe: Option<impl Read + Send + 'static>,
) -> std::thread::JoinHandle<std::io::Result<Vec<u8>>> {
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut pipe) = pipe {
            pipe.read_to_end(&mut bytes)?;
        }
        Ok(bytes)
    })
}
impl ITrustedChild {
    pub fn wait_with_output(self) -> std::io::Result<Output> {
        let stdout = read_pipe(self.child.take_stdout());
        let stderr = read_pipe(self.child.take_stderr());
        drop(self.child.take_stdin());
        let status = self.child.wait()?;
        Ok(Output {
            status,
            stdout: stdout
                .join()
                .map_err(|_| std::io::Error::other("Output reader failed"))??,
            stderr: stderr
                .join()
                .map_err(|_| std::io::Error::other("Output reader failed"))??,
        })
    }
}

pub fn exec_trusted(name: &str, args: &[String], options: &ISpawnOptions) -> Result<Output> {
    let output = spawn_trusted(name, args, options)?
        .wait_with_output()
        .map_err(failure)?;
    if !output.status.success() {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Subprocess failed",
        ));
    }
    Ok(output)
}
pub fn exec_trusted_sync(name: &str, args: &[String], options: &ISpawnOptions) -> Result<String> {
    let mut options = options.clone();
    if options.timeout.is_none() {
        options.timeout = Some(5000);
    }
    let output = exec_trusted(name, args, &options)?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
