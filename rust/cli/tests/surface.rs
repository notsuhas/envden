use std::{path::Path, process::Command};

#[test]
fn parser_matches_reference_binary() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let reference = root.join("../../apps/cli/dist/envden");
    if !reference.is_file() {
        return;
    }
    let cases: &[&[&str]] = &[
        &["--version"],
        &["serve", "--port", "bad"],
        &["-V"],
        &["version"],
        &["--unknown"],
        &["unknown"],
        &["statu"],
        &["device", "list"],
        &["device", "wat"],
        &["device", "--help"],
        &["help", "device"],
        &["help", "device", "ls"],
        &["join"],
        &["shell", "install", "invalid"],
        &["resolve", "--keep-mine", "--take-server"],
        &["server", "move", "--resume", "--abort"],
        &["join", "--name"],
        &["version", "extra"],
        &["version", "--x"],
        &["setup", "--shell", "invalid"],
        &["setup", "--telemetry=invalid"],
        &["push", "--halp"],
        &["--help", "--unknown"],
        &["device"],
        &[],
        &["config", "not-a-setting"],
        &["config", "telemetry", "bad"],
        &["config", "agent-merge", "on"],
        &["config", "unlock-period", "2d"],
    ];
    let home = tempfile::tempdir().unwrap();
    for args in cases {
        let run = |binary: &Path| {
            Command::new(binary)
                .args(*args)
                .env("HOME", home.path())
                .env("ENVDEN_HOME", home.path().join("envden"))
                .env("ENVDEN_NO_UPDATE_CHECK", "1")
                .env("ENVDEN_TELEMETRY", "0")
                .env("ENVDEN_NO_REPORT", "1")
                .output()
                .unwrap()
        };
        let ts = run(&reference);
        let rust = run(Path::new(env!("CARGO_BIN_EXE_envden")));
        assert_eq!(
            (
                rust.status.code(),
                String::from_utf8_lossy(&rust.stdout),
                String::from_utf8_lossy(&rust.stderr)
            ),
            (
                ts.status.code(),
                String::from_utf8_lossy(&ts.stdout),
                String::from_utf8_lossy(&ts.stderr)
            ),
            "{args:?}"
        );
    }
}
