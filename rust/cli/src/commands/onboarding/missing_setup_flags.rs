use serde_json::Value;

pub fn missing_setup_flags(interactive: bool, choices: &Value) -> Vec<&'static str> {
    if interactive || choices["yes"] == true {
        return vec![];
    }
    let selected = |key: &str| choices[key].as_str().is_some_and(|s| !s.is_empty());
    let mut missing = vec![];
    if !selected("server") && choices["hostServer"] != true {
        missing.push("--server <url> or --host-server");
    }
    for (key, flag) in [
        ("telemetry", "--telemetry on|off"),
        ("updateCheck", "--update-check on|off"),
        ("shell", "--shell zsh|bash|fish|powershell|none"),
        ("agent", "--agent on|off"),
    ] {
        if !selected(key) {
            missing.push(flag);
        }
    }
    if choices["scanRoot"].as_array().is_none_or(Vec::is_empty) {
        missing.push("--scan-root <path...>");
    }
    missing
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn lists_every_unanswered_choice_without_terminal() {
        assert_eq!(missing_setup_flags(false, &json!({})).len(), 6);
        assert!(missing_setup_flags(false, &json!({"yes":true})).is_empty());
        assert!(missing_setup_flags(true, &json!({})).is_empty());
        assert!(missing_setup_flags(false,&json!({"server":"https://example.test","telemetry":"off","updateCheck":"on","shell":"none","agent":"off","scanRoot":["/tmp"]})).is_empty());
    }
}
