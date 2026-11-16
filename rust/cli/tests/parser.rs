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
        assert!(
            matches!(run(&["join"]), TParseResult::Error(s) if s == "error: missing required argument 'server'")
        );
        assert!(
            matches!(run(&["statu"]), TParseResult::Error(s) if s == "error: unknown command 'statu'(Did you mean status?)")
        );
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
