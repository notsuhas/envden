use envden_adapter_network_tailscale::*;
use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode},
};
use envden_testing::network::{TNetworkScenario, network_contract};

#[test]
fn contract() {
    network_contract(|scenario| {
        Box::new(create_tailscale_network_adapter(Some(Box::new(
            move |args| {
                let mut result = ICommandResult {
                    exit_code: 0,
                    stdout: "{}".into(),
                    stderr: String::new(),
                };
                if args[0] == "status" {
                    result.stdout = serde_json::json!({"BackendState":"Running","Self":{"DNSName":"machine.ts.net."},"CertDomains":["machine.ts.net"]}).to_string();
                    if let TNetworkScenario::Problem(kind) = scenario {
                        match kind {
                            TNetworkProblemKind::NotInstalled => {
                                return Err(EnvdenError::new(ErrorCode::Internal, "Unavailable"));
                            }
                            TNetworkProblemKind::NotRunning => result.exit_code = 1,
                            TNetworkProblemKind::LoggedOut => {
                                result.stdout = "{\"BackendState\":\"NeedsLogin\"}".into()
                            }
                            TNetworkProblemKind::HttpsDisabled => {
                                result.stdout = "{\"BackendState\":\"Running\"}".into()
                            }
                            TNetworkProblemKind::Unreadable => result.stdout = "invalid".into(),
                        }
                    }
                } else if args[1] == "status" && scenario == TNetworkScenario::AddressTaken {
                    result.stdout = "{\"TCP\":{\"8080\":{\"TCPForward\":\"other\"}}}".into();
                } else if args[1] == "--bg" && scenario == TNetworkScenario::PublishFailed {
                    result.exit_code = 1;
                }
                Ok(result)
            },
        ))))
    });
}

#[test]
fn exact_commands() {
    use std::sync::{Arc, Mutex};
    let calls = Arc::new(Mutex::new(Vec::new()));
    let captured = calls.clone();
    let adapter = create_tailscale_network_adapter(Some(Box::new(move |args| {
        captured.lock().unwrap().push(args.to_vec());
        Ok(ICommandResult {
            exit_code: 0,
            stderr: String::new(),
            stdout: if args[0] == "status" {
                "{\"BackendState\":\"Running\",\"Self\":{\"DNSName\":\"host.\"},\"CertDomains\":[\"host\"]}".into()
            } else {
                "{}".into()
            },
        })
    })));
    assert_eq!(adapter.expose(123.0).unwrap(), "https://host:123");
    assert_eq!(
        *calls.lock().unwrap(),
        vec![
            vec!["status", "--json"],
            vec!["serve", "status", "--json"],
            vec!["serve", "--bg", "--https=123", "http://127.0.0.1:123"]
        ]
    );
}

#[test]
fn schema_fallbacks_and_capped_command_errors() {
    let adapter = create_tailscale_network_adapter(Some(Box::new(|args| {
        Ok(ICommandResult {
            exit_code: if args[0] == "serve" { 1 } else { 0 },
            stdout:
                r#"{"BackendState":"Running","Self":{"DNSName":"host."},"CertDomains":["host"]}"#
                    .into(),
            stderr: format!("  hint{}  ", "x".repeat(1000)),
        })
    })));
    let error = adapter.expose(3000.0).unwrap_err();
    assert_eq!(
        error.message,
        format!("Tailscale serve status failed: hint{}", "x".repeat(496))
    );
    for (json, kind) in [
        (
            r#"{"BackendState":"NeedsLogin"}"#,
            TNetworkProblemKind::LoggedOut,
        ),
        (
            r#"{"BackendState":"Stopped"}"#,
            TNetworkProblemKind::NotRunning,
        ),
        (
            r#"{"BackendState":"Running","Self":false,"CertDomains":true}"#,
            TNetworkProblemKind::HttpsDisabled,
        ),
        (r#"{"BackendState":1}"#, TNetworkProblemKind::Unreadable),
    ] {
        let adapter = create_tailscale_network_adapter(Some(Box::new(move |_| {
            Ok(ICommandResult {
                exit_code: 0,
                stdout: json.into(),
                stderr: String::new(),
            })
        })));
        assert_eq!(adapter.status().unwrap().problem.unwrap().kind, kind);
    }
}
