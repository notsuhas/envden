use std::process::Command;

#[test]
fn empty_home_uses_working_directory_for_reads_and_writes() {
    let root = tempfile::tempdir().unwrap();
    for (args, expected) in [
        (
            vec!["status"],
            "Not set up yet. Run envden setup or envden join\n",
        ),
        (
            vec!["status", "--json"],
            "{\"configured\":false,\"update\":{\"available\":false,\"required\":false}}\n",
        ),
        (vec!["config", "telemetry", "off"], "telemetry: off\n"),
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_envden"))
            .args(args)
            .current_dir(root.path())
            .env("HOME", root.path())
            .env("USERPROFILE", root.path())
            .env("ENVDEN_HOME", "")
            .env("ENVDEN_NO_UPDATE_CHECK", "1")
            .env("DO_NOT_TRACK", "1")
            .output()
            .unwrap();
        assert!(output.status.success(), "{output:?}");
        assert_eq!(String::from_utf8(output.stdout).unwrap(), expected);
        assert!(output.stderr.is_empty());
        assert!(root.path().join("state").is_dir());
    }
    let config: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.path().join("config.json")).unwrap()).unwrap();
    assert_eq!(config["telemetry"], false);
}
