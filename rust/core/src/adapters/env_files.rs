use super::{IEnvFileRules, byte_sensitive_env_pattern, unsupported_env_pattern};
use crate::errors::{EnvdenError, ErrorCode, Result};

pub fn accepts_env_path(path: &str, options: Option<&IEnvFileRules>) -> Result<bool> {
    let empty = IEnvFileRules::default();
    let options = options.unwrap_or(&empty);
    let parts: Vec<_> = path.split('/').collect();
    let name = parts.last().copied().unwrap_or("");
    let skipped = [
        ".git",
        "node_modules",
        ".next",
        "dist",
        "build",
        "out",
        "coverage",
        ".turbo",
        ".cache",
        "vendor",
    ];
    let skip = parts[..parts.len() - 1].iter().any(|part| {
        let lower = part.to_lowercase();
        skipped.contains(&lower.as_str())
            || options
                .extra_skipped
                .as_ref()
                .is_some_and(|v| v.iter().any(|p| p.to_lowercase() == lower))
    });
    if skip || name.to_lowercase() == ".envrc" {
        return Ok(false);
    }

    let included = match &options.include {
        Some(patterns) => matches(patterns, path, name)?,
        None => default_env_name(name),
    };

    if !included {
        return Ok(false);
    }

    let excluded = match &options.exclude {
        Some(patterns) => matches(patterns, path, name)?,
        None => [".example", ".sample", ".template", ".defaults"]
            .iter()
            .any(|s| name.ends_with(s)),
    };

    Ok(!excluded)
}

// Mirrors `/^\.env(?:\..+)?$/`, whose `.` stops at JavaScript line terminators.
fn default_env_name(name: &str) -> bool {
    name == ".env"
        || name.strip_prefix(".env.").is_some_and(|rest| {
            !rest.is_empty() && !rest.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
        })
}

fn matches(patterns: &[String], path: &str, name: &str) -> Result<bool> {
    for pattern in patterns {
        let target = if pattern.contains('/') { path } else { name };

        if unsupported_env_pattern(pattern)
            || (byte_sensitive_env_pattern(pattern) && !target.is_ascii())
        {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Unsupported env file pattern",
            ));
        }

        if fast_glob::glob_match(pattern, target) {
            return Ok(true);
        }
    }

    Ok(false)
}
