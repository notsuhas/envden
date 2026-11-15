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
