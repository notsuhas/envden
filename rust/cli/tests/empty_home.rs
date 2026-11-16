use std::process::Command;

#[test]
fn an_empty_envden_home_uses_the_default_home() {
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
        assert!(root.path().join(".envden/state").is_dir());
        assert!(!root.path().join("state").exists());
    }
    let config: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.path().join(".envden/config.json")).unwrap())
            .unwrap();
    assert_eq!(config["telemetry"], false);
}
