use envden_core::{
    adapters::unsupported_env_pattern,
    errors::{EnvdenError, ErrorCode, Result},
};
use serde_json::Value;
use std::{fs, path::Path};

pub(super) fn refuse_patterns(rules: &Value) -> Result<()> {
    let refused = ["include", "exclude"]
        .iter()
        .filter_map(|key| rules[key].as_array())
        .flatten()
        .filter_map(Value::as_str)
        .any(unsupported_env_pattern);

    if refused {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Unsupported env file pattern",
        ));
    }

    Ok(())
}

// Runs before a sync writes; any other config problem surfaces where it always has.
pub fn refuse_configured_patterns(home: &Path) -> Result<()> {
    let Ok(bytes) = fs::read(home.join("config.json")) else {
        return Ok(());
    };
    let Ok(config) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&bytes)) else {
        return Ok(());
    };

    refuse_patterns(&config["env-files"])
}
