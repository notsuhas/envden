#[cfg(test)]
mod tests {
    use envden_cli::program::{TParseResult, command_tree, parse};
    fn run(args: &[&str]) -> TParseResult<'static> {
        parse(
            command_tree(),
            &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        )
    }
    #[test]
    fn surface() {
        assert!(matches!(
            run(&["device", "ls", "--help"]),
            TParseResult::Help(_, false)
        ));
        assert!(matches!(run(&["--version"]), TParseResult::Version));
        assert!(matches!(run(&["join"]), TParseResult::Error(s) if s.contains("server")));
        assert!(matches!(run(&["statu"]), TParseResult::Error(s) if s.contains("statu")));
    }
}

#[test]
fn restore_versions_are_parsed_before_dispatch() {
    use envden_cli::program::{TParseResult, command_tree, parse};
    let TParseResult::Action(invocation) = parse(
        command_tree(),
        &["history".into(), "--restore".into(), "v3".into()],
    ) else {
        panic!("action expected")
    };
    assert_eq!(invocation.options["restore"], serde_json::json!(3));
    assert!(!matches!(
        parse(
            command_tree(),
            &["history".into(), "--restore".into(), "0".into()]
        ),
        TParseResult::Action(_)
    ));
}

#[test]
fn dashboard_ports_use_javascript_number_prefixes() {
    use envden_cli::program::{TParseResult, command_tree, parse};
    for (text, expected) in [("0x10", 16), ("0X10", 16), ("0b10", 2), ("0o10", 8)] {
        let TParseResult::Action(invocation) =
            parse(command_tree(), &["ui".into(), "--port".into(), text.into()])
        else {
            panic!("action expected")
        };
        assert_eq!(
            invocation.options["port"].as_f64(),
            Some(f64::from(expected))
        );
    }
}

#[test]
fn unknown_help_targets_print_parent_help_to_stderr() {
    for (argv, usage) in [
        (vec!["device", "help", "foo"], "Usage: envden device"),
        (vec!["help", "help"], "Usage: envden"),
        (vec!["device", "help", "help"], "Usage: envden device"),
    ] {
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_envden"))
            .args(argv)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(1));
        assert!(output.stdout.is_empty());
        assert!(String::from_utf8_lossy(&output.stderr).contains(usage));
    }
}

#[test]
fn parser_errors_keep_their_line_breaks_and_strip_control_bytes_at_every_depth() {
    use envden_cli::program::{TParseResult, command_tree, parse};

    for (args, expected) in [
        (
            vec!["statu"],
            "error: unknown command 'statu'\n(Did you mean status?)",
        ),
        (
            vec!["\x1b[2Jstatu\nforged"],
            "error: unknown command '[2Jstatuforged'",
        ),
        (
            vec!["rm", "--yesx", ".env"],
            "error: unknown option '--yesx'\n(Did you mean --yes?)",
        ),
        (
            vec!["rm", "--x\x1b[31mred", ".env"],
            "error: unknown option '--x[31mred'",
        ),
        (
            vec!["device", "ls", "--\x1b]0;title\x07"],
            "error: unknown option '--]0;title'",
        ),
        (
            vec!["shell", "install", "in\x1b[1m\nvalid"],
            "error: invalid value 'in[1mvalid' for '[shell]'\n  [possible values: zsh, bash, fish, powershell]",
        ),
    ] {
        let args: Vec<String> = args.into_iter().map(String::from).collect();
        let TParseResult::Error(message) = parse(command_tree(), &args) else {
            panic!("error expected for {args:?}");
        };

        assert_eq!(message, expected, "{args:?}");
    }
}
