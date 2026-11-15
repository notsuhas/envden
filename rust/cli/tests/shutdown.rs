#![cfg(unix)]

use std::{
    io::{BufRead, BufReader},
    process::{Command, Stdio},
};

#[test]
fn serve_sigterm_exits_successfully() {
    let home = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_envden"))
        .args(["serve", "--port", "0", "--data-dir"])
        .arg(home.path().join("server"))
        .env("HOME", home.path())
        .env("ENVDEN_HOME", home.path().join("envden"))
        .env("ENVDEN_NO_UPDATE_CHECK", "1")
        .env("ENVDEN_TELEMETRY", "0")
        .env("ENVDEN_NO_REPORT", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let output = child.stdout.take().unwrap();
    for line in BufReader::new(output).lines() {
        if line.unwrap().starts_with("envden listening on ") {
            nix::sys::signal::kill(
                nix::unistd::Pid::from_raw(child.id() as i32),
                nix::sys::signal::Signal::SIGTERM,
            )
            .unwrap();
            break;
        }
    }
    assert!(child.wait_with_output().unwrap().status.success());
}
