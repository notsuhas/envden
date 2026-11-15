use envden_core::adapters::*;
use serde_json::Value;

pub(crate) fn problem(kind: TNetworkProblemKind) -> INetworkProblem {
    let message = match kind {
        TNetworkProblemKind::NotInstalled => {
            "Tailscale isn't installed. Get it from https://tailscale.com/download"
        }
        TNetworkProblemKind::NotRunning => "Tailscale isn't running. Start it, then try again",
        TNetworkProblemKind::LoggedOut => "Log in to Tailscale with tailscale up, then try again",
        TNetworkProblemKind::HttpsDisabled => {
            "Enable HTTPS certificates in the Tailscale admin console: https://login.tailscale.com/admin/dns"
        }
        TNetworkProblemKind::Unreadable => {
            "Tailscale's status couldn't be read. Run tailscale status to check it"
        }
    };
    INetworkProblem {
        kind,
        message: message.into(),
    }
}

pub(crate) fn unavailable(kind: TNetworkProblemKind) -> INetworkStatus {
    INetworkStatus {
        problem: Some(problem(kind)),
        ..Default::default()
    }
}

pub(crate) fn parse(stdout: &str) -> Option<INetworkStatus> {
    let value: Value = serde_json::from_str(stdout).ok()?;
    let state = value.get("BackendState")?.as_str()?;
    let running = state == "Running";
    let logged_in = !["NeedsLogin", "NoState"].contains(&state);
    let hostname = value
        .pointer("/Self/DNSName")
        .and_then(Value::as_str)
        .map(|s| s.strip_suffix('.').unwrap_or(s).to_owned());
    let domains = value
        .get("CertDomains")
        .and_then(Value::as_array)
        .filter(|a| a.iter().all(Value::is_string));
    let https_enabled = hostname
        .as_ref()
        .is_some_and(|h| domains.is_some_and(|a| a.iter().any(|v| v.as_str() == Some(h))));
    let issue = if !logged_in {
        Some(TNetworkProblemKind::LoggedOut)
    } else if !running {
        Some(TNetworkProblemKind::NotRunning)
    } else if !https_enabled {
        Some(TNetworkProblemKind::HttpsDisabled)
    } else {
        None
    };
    Some(INetworkStatus {
        ready: issue.is_none(),
        running,
        logged_in,
        https_enabled,
        hostname,
        problem: issue.map(problem),
    })
}
