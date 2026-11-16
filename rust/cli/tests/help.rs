use envden_cli::program::{ICommand, TParseResult, command_tree, format_help, parse};

#[test]
fn every_command_has_native_help_and_keeps_its_description() {
    fn walk(command: &ICommand) {
        let help = format_help(command, 80);
        assert!(help.contains("Usage:"), "{}", command.name);
        assert!(help.contains(&command.description), "{}", command.name);
        for flag in ["--help", "-h"] {
            let mut args = command.path.clone();
            args.push(flag.into());
            assert!(matches!(parse(command_tree(), &args), TParseResult::Help(found, false) if found.path == command.path), "{args:?}");
        }
        for child in &command.commands { walk(child); }
    }
    walk(command_tree());
}
