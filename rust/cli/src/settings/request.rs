use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub const SETTINGS: &[&str] = &[
    "telemetry",
    "update-check",
    "agent-merge",
    "auto-approve-worktrees",
    "unlock-period",
    "placement",
    "env-files",
];

pub enum TSettingRequest<'a> {
    List,
    Read(&'a str),
    Set(&'a str, &'a str),
    Placement(&'a str, &'a str),
    UnlockPeriod(&'a str),
}

pub fn unlock_period(value: &str) -> Result<Option<u64>> {
    match value {
        "1d" => Ok(Some(86_400_000)),
        "7d" => Ok(Some(604_800_000)),
        "30d" => Ok(Some(2_592_000_000)),
        "never" => Ok(None),
        _ => Err(invalid("Expected 1d, 7d, 30d or never")),
    }
}

pub fn setting_request(arguments: &[String]) -> Result<TSettingRequest<'_>> {
    let Some(key) = arguments.first().map(String::as_str) else {
        return Ok(TSettingRequest::List);
    };
    if !SETTINGS.contains(&key) {
        return Err(invalid(format!(
            "Unknown setting '{key}'. Valid settings: {}",
            SETTINGS.join(", ")
        )));
    }
    let Some(value) = arguments.get(1).map(String::as_str) else {
        return Ok(TSettingRequest::Read(key));
    };
    if key == "placement" {
        if arguments.len() != 3 || !matches!(arguments[2].as_str(), "link" | "copy") {
            return Err(invalid("Expected placement <checkout> link|copy"));
        }
        return Ok(TSettingRequest::Placement(value, &arguments[2]));
    }
    if arguments.len() > 2 {
        return Err(invalid(format!("Expected one value for {key}")));
    }
    if key == "unlock-period" {
        unlock_period(value)?;
        return Ok(TSettingRequest::UnlockPeriod(value));
    }
    if key != "env-files" && !matches!(value, "on" | "off") {
        return Err(invalid(format!("Expected on or off for {key}")));
    }
    Ok(TSettingRequest::Set(key, value))
}

fn invalid(message: impl Into<std::borrow::Cow<'static, str>>) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidInput, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_whole_request_before_prompts() {
        for (args, message) in [
            (vec!["telemetry", "yes"], "Expected on or off for telemetry"),
            (
                vec!["placement", "root"],
                "Expected placement <checkout> link|copy",
            ),
            (vec!["unlock-period", "2d"], "Expected 1d, 7d, 30d or never"),
            (
                vec!["telemetry", "on", "extra"],
                "Expected one value for telemetry",
            ),
        ] {
            assert_eq!(
                setting_request(&args.iter().map(|s| s.to_string()).collect::<Vec<_>>())
                    .err()
                    .unwrap()
                    .message,
                message
            );
        }
        assert_eq!(unlock_period("never").unwrap(), None);
        assert_eq!(unlock_period("7d").unwrap(), Some(604_800_000));
    }
}
