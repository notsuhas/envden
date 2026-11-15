use super::doctor::IDoctorReport;
use crate::output::sanitize_console;
use envden_core::adapters::{INetworkProblem, THttpsCheck, TNetworkProblemKind};
use serde_json::{Value, json};

pub fn doctor_text(report: &IDoctorReport) -> String {
    let location = &report.keys.location;
    let keys = if report.keys.owner_only {
        format!("✓ Keys: private files in {location} (owner-only, like ~/.ssh)")
    } else {
        format!(
            "✗ Keys: other users can read key files in {location}; run chmod -R go-rwx {location}"
        )
    };
    let update = &report.update;
    let message = update["message"].as_str().unwrap_or("");
    let note = if message.is_empty() {
        String::new()
    } else {
        format!(" ({message})")
    };
    let update = if update["required"] == true {
        format!("✗ Update required; run envden update{note}")
    } else if update["available"] == true {
        format!("! Update available; run envden update{note}")
    } else if message.is_empty() {
        "✓ envden is up to date".into()
    } else {
        format!("! {message}")
    };
    let network = &report.tailscale;
    let tailscale = if network.ready {
        match network.hostname.as_deref().filter(|s| !s.is_empty()) {
            Some(name) => format!("✓ Tailscale: connected as {name}"),
            None => "✓ Tailscale: connected".into(),
        }
    } else {
        let message = network
            .problem
            .as_ref()
            .map(|p| p.message.as_str())
            .unwrap_or(if !network.running {
                "not running"
            } else if network.logged_in {
                "not ready"
            } else {
                "not logged in"
            });
        format!("✗ Tailscale: {message}")
    };
    let https = match &report.https {
        THttpsCheck::Ready => "✓ HTTPS certificates enabled".into(),
        THttpsCheck::Problem(p) => format!("✗ HTTPS certificates: {}", p.message),
    };
    let mut lines = vec![
        keys,
        if report.symlinks {
            "✓ Symlinks work"
        } else {
            "! Symlinks unavailable; checkouts get copies"
        }
        .into(),
        update,
        tailscale,
        https,
    ];
    let shells: Vec<_> = report.shells.iter().filter(|s| s.installed).collect();
    if shells.is_empty() {
        lines.push("! Shell notice: not installed; run envden shell install".into());
    }
    for shell in shells {
        lines.push(format!("✓ Shell notice: {} ({})", shell.shell, shell.path));
    }
    sanitize_console(&lines.join("\n"))
}

fn problem_json(problem: &INetworkProblem) -> Value {
    json!({"kind":match problem.kind {
        TNetworkProblemKind::NotInstalled => "not-installed",
        TNetworkProblemKind::NotRunning => "not-running",
        TNetworkProblemKind::LoggedOut => "logged-out",
        TNetworkProblemKind::HttpsDisabled => "https-disabled",
        TNetworkProblemKind::Unreadable => "unreadable",
    }, "message":problem.message})
}

pub fn doctor_json(report: &IDoctorReport) -> Value {
    let network = &report.tailscale;
    let mut tailscale = json!({"ready":network.ready,"running":network.running,"loggedIn":network.logged_in,"httpsEnabled":network.https_enabled});
    if let Some(hostname) = &network.hostname {
        tailscale["hostname"] = json!(hostname);
    }
    if let Some(problem) = &network.problem {
        tailscale["problem"] = problem_json(problem);
    }
    let https = match &report.https {
        THttpsCheck::Ready => json!({"kind":"ready"}),
        THttpsCheck::Problem(problem) => problem_json(problem),
    };
    json!({"keys":{"location":report.keys.location,"ownerOnly":report.keys.owner_only},"symlinks":report.symlinks,"update":report.update,"tailscale":tailscale,"https":https,"shells":report.shells.iter().map(|s|json!({"shell":s.shell,"path":s.path,"installed":s.installed})).collect::<Vec<_>>()})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::{IKeyReport, IShellReport};
    use envden_core::adapters::{INetworkProblem, INetworkStatus, TNetworkProblemKind};

    #[test]
    fn doctor_text_and_json_match_report_fields() {
        let report = IDoctorReport {
            keys: IKeyReport {
                location: "~/.envden".into(),
                owner_only: true,
            },
            symlinks: true,
            update: json!({"available":false,"required":false}),
            tailscale: INetworkStatus {
                ready: true,
                running: true,
                logged_in: true,
                https_enabled: true,
                hostname: Some("host.tail.ts.net".into()),
                problem: None,
            },
            https: THttpsCheck::Ready,
            shells: vec![IShellReport {
                shell: "zsh".into(),
                path: "/home/.zshrc".into(),
                installed: true,
            }],
        };
        assert_eq!(
            doctor_text(&report),
            "✓ Keys: private files in ~/.envden (owner-only, like ~/.ssh)\n✓ Symlinks work\n✓ envden is up to date\n✓ Tailscale: connected as host.tail.ts.net\n✓ HTTPS certificates enabled\n✓ Shell notice: zsh (/home/.zshrc)"
        );
        let value = doctor_json(&report);
        assert_eq!(value["keys"]["ownerOnly"], true);
        assert_eq!(value["tailscale"]["loggedIn"], true);
        assert_eq!(value["https"], json!({"kind":"ready"}));
        assert_eq!(
            problem_json(&INetworkProblem {
                kind: TNetworkProblemKind::NotInstalled,
                message: "missing".into()
            }),
            json!({"kind":"not-installed","message":"missing"})
        );
    }
}
