use envden_cli::{
    adapters::create_adapters,
    output::{error_exit_code, print, print_error},
    program::{
        DefaultActions, DefaultHooks, TParseResult, command_tree, dispatch, format_help, parse,
    },
    version::VERSION,
};
use std::{
    io::{self, IsTerminal, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|s| s == "telemetry-send") {
        envden_cli::output::telemetry::deliver_telemetry(
            std::env::var("ENVDEN_TELEMETRY_BODY").ok().as_deref(),
        );
        return;
    }
    match parse(command_tree(), &args) {
        TParseResult::Help(command, error) => {
            let width = if io::stdout().is_terminal() {
                crossterm::terminal::size()
                    .map(|(w, _)| usize::from(w))
                    .unwrap_or(80)
            } else {
                80
            };
            let text = format_help(command, width);
            if error {
                let _ = io::stderr().write_all(text.as_bytes());
                std::process::exit(1);
            } else {
                let _ = io::stdout().write_all(text.as_bytes());
            }
        }
        TParseResult::Version => print(VERSION),
        TParseResult::Error(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
        TParseResult::Action(invocation) => {
            let home = std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default();
            let adapters = create_adapters(None, home, now);
            if let Err(error) = dispatch(&invocation, &adapters, &DefaultActions, &DefaultHooks) {
                print_error(&error.message);
                std::process::exit(error_exit_code(error.code));
            }
        }
    }
}
