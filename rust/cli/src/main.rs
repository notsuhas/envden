use envden_cli::{
    adapters::create_adapters,
    output::{error_exit_code, print, print_error},
    program::{
        DefaultActions, DefaultHooks, TParseResult, command_tree, dispatch, format_help, parse,
    },
    updates::status::{record_command_result, with_update_status},
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
        TParseResult::Failure(error) => {
            print_error(&error.message);
            std::process::exit(error_exit_code(error.code));
        }
        TParseResult::Action(invocation) => {
            let home = std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_default();
            let adapters = create_adapters(None, home, now);
            let result = with_update_status(&adapters.home, || {
                dispatch(&invocation, &adapters, &DefaultActions, &DefaultHooks)
            });
            if let Err(error) = record_command_result(&adapters.home, result, now()) {
                print_error(&error.message);
                envden_cli::report::launch::offer_report(&error, &adapters);
                std::process::exit(error_exit_code(error.code));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn client_too_old_records_running_version_except_unpublished_minimum() {
        use envden_cli::updates::status::record_command_result;
        use envden_core::errors::{EnvdenError, ErrorCode};
        let home = tempfile::tempdir().unwrap();
        let marker = home.path().join("state/update-required");
        let unpublished = Err(EnvdenError::new(
            ErrorCode::ClientTooOld,
            "The server requires a version that doesn't exist",
        ));
        assert!(record_command_result(home.path(), unpublished, 1).is_err());
        assert!(!marker.exists());
        let rejected = Err(EnvdenError::new(
            ErrorCode::ClientTooOld,
            "Update envden to meet the signed server minimum",
        ));
        assert!(record_command_result(home.path(), rejected, 1).is_err());
        assert_eq!(
            std::fs::read_to_string(marker).unwrap(),
            envden_cli::version::VERSION
        );
    }
}
