use crate::settings::read_config;
use envden_core::{adapters::IEnvFileRules, errors::Result};
use std::path::Path;

pub fn env_rules(home: &Path) -> Result<IEnvFileRules> {
    let config = read_config(home)?;
    let patterns = |key| {
        config["env-files"][key].as_array().map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
    };
    Ok(IEnvFileRules {
        include: patterns("include"),
        exclude: patterns("exclude"),
        extra_skipped: patterns("extraSkipped"),
    })
}
