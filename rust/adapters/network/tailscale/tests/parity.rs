use envden_adapter_network_tailscale::*;
use envden_core::adapters::*;
use std::sync::{Arc, Mutex};

const RUNNING: &str = include_str!("fixtures/running.json");

#[test]
fn recorded_status_and_commands() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let adapter = create_tailscale_network_adapter(Some(Box::new(move |args| {
        captured.lock().unwrap().push(args.to_vec());
        Ok(ICommandResult {
            exit_code: 0,
            stdout: if args[0] == "serve" { "{}" } else { RUNNING }.into(),
            stderr: String::new(),
        })
    })));
    let status = adapter.status().unwrap();
    assert!(status.ready && status.running && status.logged_in && status.https_enabled);
    assert_eq!(status.hostname.as_deref(), Some("laptop.tail.example"));
    assert!(status.problem.is_none());
    assert_eq!(
        adapter.check_https_certificate().unwrap(),
        THttpsCheck::Ready
    );
    assert_eq!(
        adapter.expose(3000.0).unwrap(),
        "https://laptop.tail.example:3000"
    );
    let calls = calls.lock().unwrap();
    assert_eq!(
        &calls[calls.len() - 2..],
        &[
            vec!["serve", "status", "--json"],
            vec!["serve", "--bg", "--https=3000", "http://127.0.0.1:3000"],
        ]
    );
}

#[test]
fn unavailable_certificate_causes() {
    for (exit_code, stdout, stderr, kind) in [
        (
            1,
            "",
            "failed to connect to local tailscaled",
            TNetworkProblemKind::NotRunning,
        ),
        (0, "[]", "", TNetworkProblemKind::Unreadable),
    ] {
        let adapter = create_tailscale_network_adapter(Some(Box::new(move |_| {
            Ok(ICommandResult {
                exit_code,
                stdout: stdout.into(),
                stderr: stderr.into(),
            })
        })));
        let THttpsCheck::Problem(problem) = adapter.check_https_certificate().unwrap() else {
            panic!("certificate unexpectedly ready")
        };
        assert_eq!(problem.kind, kind);
    }
}

#[test]
fn conflict_never_publishes_or_changes_port_443() {
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let adapter = create_tailscale_network_adapter(Some(Box::new(move |args| {
        captured.lock().unwrap().push(args.to_vec());
        Ok(ICommandResult { exit_code: 0, stderr: String::new(), stdout: if args[0] == "serve" {
            r#"{"Web":{"laptop.tail.example:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3773"}}},"laptop.tail.example:4280":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:9000"}}}}}"#
        } else { RUNNING }.into() })
    })));
    assert_eq!(
        adapter.expose(4280.0).unwrap_err().code,
        envden_core::errors::ErrorCode::Conflict
    );
    assert!(
        !calls
            .lock()
            .unwrap()
            .iter()
            .any(|args| args.iter().any(|arg| arg == "--bg"))
    );
}
