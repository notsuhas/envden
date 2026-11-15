use envden_cli::program::{ICommand, command_tree, format_help};
use std::{fs, path::Path, process::Command};

#[test]
fn binary_help_fixtures() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let binary = root.join("../../apps/cli/dist/envden");
    fn walk(command: &ICommand, root: &Path, binary: &Path) {
        let name = if command.path.is_empty() {
            "root".into()
        } else {
            command.path.join("-")
        };
        let fixture = root.join(format!("tests/fixtures/{name}.help"));
        if binary.is_file() {
            let output = Command::new(binary)
                .args(&command.path)
                .arg("--help")
                .env("ENVDEN_NO_UPDATE_CHECK", "1")
                .env("ENVDEN_TELEMETRY", "0")
                .output()
                .expect("TS binary");
            assert!(output.status.success());
            if std::env::var_os("ENVDEN_CAPTURE_HELP").is_some() {
                fs::write(&fixture, &output.stdout).unwrap();
            }
            assert_eq!(fs::read(&fixture).unwrap(), output.stdout, "{name}");
        }
        assert_eq!(
            format_help(command, 80),
            fs::read_to_string(fixture).unwrap()
        );
        for child in &command.commands {
            walk(child, root, binary);
        }
    }
    walk(command_tree(), root, &binary);
}
