use serde_json::{Value, json};

pub struct IEvent<'a> {
    pub command: &'a str,
    pub success: bool,
    pub error_code: Option<envden_core::errors::ErrorCode>,
    pub changed: Option<u64>,
    pub conflicts: Option<u64>,
}

pub fn telemetry_payload(id: &str, event: &IEvent<'_>, os: &str) -> Value {
    let mut properties = json!({"distinct_id": id, "version": crate::version::VERSION, "os": os, "command": event.command, "success":event.success});
    if let Some(code) = event.error_code {
        properties["error_code"] = Value::String(code.as_str().into());
    }
    for (key, count) in [("changed", event.changed), ("conflicts", event.conflicts)] {
        if let Some(count) = count.filter(|c| *c <= 9_007_199_254_740_991) {
            properties[key] = count.into();
        }
    }
    properties["$ip"] = Value::Null;
    properties["$geoip_disable"] = Value::Bool(true);
    json!({"event":"cli_command", "properties":properties})
}

pub fn child_environment(
    body: &str,
    inherited: &std::collections::BTreeMap<String, String>,
) -> std::collections::BTreeMap<String, String> {
    let mut result = std::collections::BTreeMap::from([
        ("ENVDEN_TELEMETRY_BODY".into(), body.into()),
        ("ENVDEN_NO_UPDATE_CHECK".into(), "1".into()),
    ]);
    let names = [
        "ENVDEN_HOME",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
        "SSL_CERT_FILE",
        "NODE_EXTRA_CA_CERTS",
    ];
    for name in names {
        for key in std::iter::once(name.to_string())
            .chain((name != "ENVDEN_HOME").then(|| name.to_lowercase()))
        {
            if let Some(value) = inherited.get(&key).filter(|v| !v.is_empty()) {
                result.insert(key, value.clone());
            }
        }
    }
    result
}

pub fn deliver_telemetry(body: Option<&str>) {
    let Some(body) = body.filter(|b| !b.is_empty()) else {
        return;
    };
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .max_redirects(0)
        .build();
    let agent = ureq::Agent::new_with_config(config);
    let _ = agent
        .post("https://us.i.posthog.com/capture/")
        .header("Content-Type", "application/json")
        .send(body);
}

pub fn report_telemetry(adapters: &crate::adapters::IAdapters, event: &IEvent<'_>) {
    let key = option_env!("ENVDEN_TELEMETRY_KEY").unwrap_or_default();
    if key.is_empty() {
        return;
    }
    let report = || -> envden_core::errors::Result<()> {
        let config = crate::settings::read_config(&adapters.home)?;
        if config["telemetry"] != true
            || std::env::var("ENVDEN_TELEMETRY").as_deref() == Ok("0")
            || std::env::var("DO_NOT_TRACK").as_deref() == Ok("1")
        {
            return Ok(());
        }
        let id = crate::state::lock::with_state_lock(&adapters.home, (adapters.now)(), || {
            let path = adapters.home.join("state/install-id");
            if let Some(saved) =
                crate::state::files::optional_read(&path)?.filter(|v| !v.is_empty())
            {
                return Ok(saved);
            }
            let id = uuid::Uuid::new_v4().to_string();
            crate::state::files::atomic_write(&path, id.as_bytes(), (adapters.now)())?;
            Ok(id)
        })?;
        let os = match std::env::consts::OS {
            "macos" => "darwin",
            "windows" => "win32",
            other => other,
        };
        let payload = telemetry_payload(&id, event, os);
        let body =
            json!({"api_key":key,"event":payload["event"],"properties":payload["properties"]})
                .to_string();
        let env = child_environment(&body, &std::env::vars().collect());
        let mut command = std::process::Command::new(&adapters.executable);
        command
            .arg("telemetry-send")
            .env_clear()
            .envs(env)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let _ = command.spawn();
        Ok(())
    };
    let _ = report();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn child_environment_keeps_only_named_home_and_network_settings() {
        let inherited = std::collections::BTreeMap::from([
            ("envden_home".into(), "private".into()),
            ("ENVDEN_HOME".into(), "/config".into()),
            ("https_proxy".into(), "proxy".into()),
        ]);
        let result = child_environment("body", &inherited);
        assert!(!result.contains_key("envden_home"));
        assert_eq!(result["ENVDEN_HOME"], "/config");
        assert_eq!(result["https_proxy"], "proxy");
    }
}
