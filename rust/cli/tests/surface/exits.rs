use crate::cases::read;

#[test]
fn binary_retains_control_and_parser_exit_codes() {
    let cases = read(include_str!("../fixtures/parser.json"));
    let home = tempfile::tempdir().unwrap();
    for case in cases.iter().filter(|case| {
        case.kind != "action"
            && (case.argv.len() <= 1
                || case.exit == 2
                || case.argv.iter().any(|arg| arg == "--yes=false")
                || case.argv == ["help", "device", "ls"])
    }) {
        let result = std::process::Command::new(env!("CARGO_BIN_EXE_envden"))
            .args(&case.argv)
            .env("HOME", home.path())
            .env("ENVDEN_HOME", home.path().join("envden"))
            .env("ENVDEN_NO_UPDATE_CHECK", "1")
            .env("ENVDEN_TELEMETRY", "0")
            .env("ENVDEN_NO_REPORT", "1")
            .output()
            .unwrap();
        assert_eq!(result.status.code(), Some(case.exit), "{:?}", case.argv);
    }
}
