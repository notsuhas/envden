use std::process::Command;

#[test]
fn notice_sink_probe() {
    if std::env::var_os("ENVDEN_NOTICE_SINK_PROBE").is_some() {
        envden_cli::notice::command::report_command_notice(&serde_json::json!({
            "repos":["repo\u{001b}\n\u{202e}evil"],
            "update":{"available":false,"required":false}
        }));
    }
}

#[test]
fn library_error_sink_strips_controls_after_formatting() {
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "notice_sink_probe", "--nocapture"])
        .env("ENVDEN_NOTICE_SINK_PROBE", "1")
        .output()
        .unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap(),
        "envden: repoevil out of sync\n"
    );
}
