use crate::state::{
    files::{atomic_write, private_directory},
    lock::with_state_lock,
};
use envden_core::{
    adapters::unsupported_env_pattern,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::{Value, json};
use std::{fs, path::Path};

pub fn parse_config(value: Value) -> Result<Value> {
    let input = value.as_object().ok_or_else(invalid)?;
    let mut result = serde_json::Map::new();
    if input.keys().any(|k| {
        ![
            "placement",
            "env-files",
            "telemetry",
            "update-check",
            "agent-merge",
            "auto-approve-worktrees",
        ]
        .contains(&k.as_str())
    }) {
        return Err(invalid());
    }
    if let Some(placement) = input.get("placement") {
        if !placement.as_object().is_some_and(|o| {
            o.values()
                .all(|v| matches!(v.as_str(), Some("link" | "copy")))
        }) {
            return Err(invalid());
        }
        result.insert("placement".into(), placement.clone());
    }
    if let Some(rules) = input.get("env-files") {
        if !rules.as_object().is_some_and(|o| {
            o.iter().all(|(k, v)| {
                ["include", "exclude", "extraSkipped"].contains(&k.as_str())
                    && v.as_array().is_some_and(|a| {
                        a.iter().all(|p| p.as_str().is_some_and(|s| !s.is_empty()))
                    })
            })
        }) {
            return Err(invalid());
        }
        if ["include", "exclude"]
            .iter()
            .filter_map(|key| rules[key].as_array())
            .flatten()
            .any(|pattern| pattern.as_str().is_some_and(unsupported_env_pattern))
        {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Unsupported env file pattern",
            ));
        }
        let mut ordered = serde_json::Map::new();
        for key in ["include", "exclude", "extraSkipped"] {
            if let Some(v) = rules.get(key) {
                ordered.insert(key.into(), v.clone());
            }
        }
        result.insert("env-files".into(), Value::Object(ordered));
    }
    for (key, default) in [
        ("telemetry", false),
        ("update-check", true),
        ("agent-merge", false),
        ("auto-approve-worktrees", true),
    ] {
        let v = input
            .get(key)
            .unwrap_or(&Value::Bool(default))
            .as_bool()
            .ok_or_else(invalid)?;
        result.insert(key.into(), Value::Bool(v));
    }
    Ok(Value::Object(result))
}

pub fn read_config(home: &Path) -> Result<Value> {
    match fs::read(home.join("config.json")) {
        Ok(s) => parse_config(
            serde_json::from_str(&String::from_utf8_lossy(&s)).map_err(|e| {
                EnvdenError::with_source(ErrorCode::InvalidData, "Unreadable config", e)
            })?,
        ),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => parse_config(json!({})),
        Err(e) => Err(EnvdenError::with_source(
            ErrorCode::InvalidData,
            "Unreadable config",
            e,
        )),
    }
}

pub fn ensure_paths(home: &Path) -> Result<()> {
    private_directory(home)?;
    for name in ["store", "state", "base", "conflicts"] {
        private_directory(&home.join(name))?;
    }
    Ok(())
}

pub fn set_config(
    key: &str,
    value: &str,
    home: &Path,
    clock: &dyn Fn() -> u64,
    interactive: bool,
) -> Result<Value> {
    if matches!(key, "agent-merge" | "auto-approve-worktrees") && value == "on" && !interactive {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            format!("Turning on {key} requires a terminal"),
        ));
    }
    let now = clock();

    with_state_lock(home, clock, || {
        let mut config = read_config(home)?;
        config[key] = if matches!(key, "placement" | "env-files") {
            serde_json::from_str(value).map_err(|e| {
                EnvdenError::with_source(
                    ErrorCode::InvalidInput,
                    "Expected a JSON settings object",
                    e,
                )
            })?
        } else {
            match value {
                "on" => Value::Bool(true),
                "off" => Value::Bool(false),
                _ => {
                    return Err(EnvdenError::new(
                        ErrorCode::InvalidInput,
                        "Expected on or off",
                    ));
                }
            }
        };
        let next = parse_config(config)?;
        ensure_paths(home)?;
        let bytes = format!(
            "{}\n",
            serde_json::to_string_pretty(&next).map_err(|e| EnvdenError::with_source(
                ErrorCode::Internal,
                "Cannot serialize config",
                e
            ))?
        );
        atomic_write(&home.join("config.json"), bytes.as_bytes(), now)?;
        Ok(next)
    })
}

fn invalid() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidInput, "Invalid config")
}
