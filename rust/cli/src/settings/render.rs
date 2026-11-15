use serde_json::Value;

pub fn config_text(config: &Value) -> String {
    [
        "telemetry",
        "update-check",
        "agent-merge",
        "auto-approve-worktrees",
        "placement",
        "env-files",
    ]
    .iter()
    .map(|key| setting_text(key, config))
    .collect::<Vec<_>>()
    .join("\n")
}

pub fn setting_text(key: &str, config: &Value) -> String {
    if matches!(key, "placement" | "env-files") {
        let lines = config[key]
            .as_object()
            .map(|o| {
                o.iter()
                    .map(|(k, v)| {
                        let value = if key == "placement" {
                            v.as_str().unwrap_or_default().to_string()
                        } else {
                            v.as_array()
                                .map(|a| {
                                    a.iter()
                                        .filter_map(Value::as_str)
                                        .collect::<Vec<_>>()
                                        .join(", ")
                                })
                                .unwrap_or_default()
                        };
                        format!("  {k}: {value}")
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        return if lines.is_empty() {
            format!("{key}: default")
        } else {
            crate::output::sanitize_console(&format!("{key}:\n{}", lines.join("\n")))
        };
    }
    let configured = config[key].as_bool().unwrap_or(false);
    let mut effective = configured;
    if key == "telemetry"
        && (std::env::var("ENVDEN_TELEMETRY").as_deref() == Ok("0")
            || std::env::var("DO_NOT_TRACK").as_deref() == Ok("1"))
    {
        effective = false;
    }
    if key == "update-check" && std::env::var("ENVDEN_NO_UPDATE_CHECK").as_deref() == Ok("1") {
        effective = false;
    }
    let toggle = |b| if b { "on" } else { "off" };
    let text = format!("{key}: {}", toggle(effective));
    if configured == effective {
        text
    } else {
        format!(
            "{text} (set to {}; the environment overrides it)",
            toggle(configured)
        )
    }
}
