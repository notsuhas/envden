use envden_core::errors::ErrorCode;
use std::collections::BTreeMap;

pub fn derive_report_offer(
    code: Option<ErrorCode>,
    command: Option<&str>,
    interactive: bool,
    cancelled: bool,
    env: &BTreeMap<String, String>,
) -> bool {
    if !interactive || cancelled || env.get("ENVDEN_NO_REPORT").is_some_and(|s| s == "1") {
        return false;
    }
    if [
        "AI_AGENT",
        "CLAUDECODE",
        "CLAUDE_CODE_ENTRYPOINT",
        "CODEX_SANDBOX",
        "CODEX_SANDBOX_NETWORK_DISABLED",
        "CODEX_THREAD_ID",
        "CODEX_CI",
        "GEMINI_CLI",
        "CURSOR_AGENT",
        "OPENCODE",
    ]
    .iter()
    .any(|k| env.get(*k).is_some_and(|s| !s.is_empty()))
    {
        return false;
    }
    if code == Some(ErrorCode::Conflict) && matches!(command, Some("push" | "pull" | "resolve")) {
        return false;
    }
    !matches!(
        code,
        Some(
            ErrorCode::InvalidInput
                | ErrorCode::Unauthorized
                | ErrorCode::Locked
                | ErrorCode::RateLimited
                | ErrorCode::UpdateRequired
                | ErrorCode::ClientTooOld
                | ErrorCode::NotFound
                | ErrorCode::StorageQuota
                | ErrorCode::ServerUnreachable
        )
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn terminal_agent_optout_and_conflicts() {
        let env = BTreeMap::new();
        assert!(derive_report_offer(None, Some("setup"), true, false, &env));
        for code in [
            ErrorCode::InvalidData,
            ErrorCode::Internal,
            ErrorCode::Conflict,
        ] {
            assert!(derive_report_offer(
                Some(code),
                Some("setup"),
                true,
                false,
                &env
            ));
        }
        assert!(!derive_report_offer(None, None, false, false, &env));
        assert!(!derive_report_offer(None, None, true, true, &env));
        assert!(!derive_report_offer(
            Some(ErrorCode::InvalidInput),
            None,
            true,
            false,
            &env
        ));
        for command in ["push", "pull", "resolve"] {
            assert!(!derive_report_offer(
                Some(ErrorCode::Conflict),
                Some(command),
                true,
                false,
                &env
            ));
        }
        for key in ["CLAUDECODE", "ENVDEN_NO_REPORT"] {
            assert!(!derive_report_offer(
                None,
                None,
                true,
                false,
                &BTreeMap::from([(key.into(), "1".into())])
            ));
        }
    }
}
