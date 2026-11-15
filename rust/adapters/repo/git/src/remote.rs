use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    process::{ISpawnOptions, exec_trusted},
};
use percent_encoding::percent_decode_str;

fn error(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidInput, message)
}
fn decode(value: &str) -> Result<String> {
    for (i, c) in value.bytes().enumerate() {
        if c == b'%'
            && (i + 2 >= value.len()
                || !value.as_bytes()[i + 1..i + 3]
                    .iter()
                    .all(u8::is_ascii_hexdigit))
        {
            return Err(error("Unsafe git remote"));
        }
    }

    percent_decode_str(value)
        .decode_utf8()
        .map(|s| s.into_owned())
        .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidInput, "Unsafe git remote", e))
}
fn controls(value: &str) -> bool {
    regex::Regex::new(r"[\p{Cc}\p{Cf}]")
        .unwrap()
        .is_match(value)
}

pub(crate) fn parts(remote: &str) -> Result<(String, String, bool)> {
    if remote.contains("://") {
        let scheme = remote.split("://").next().unwrap().to_ascii_lowercase();
        if !["ssh", "http", "https", "git"].contains(&scheme.as_str()) {
            return Err(error("Unsupported git remote"));
        }
        if decode(remote)?.split('/').any(|s| s == "." || s == "..") {
            return Err(error("Unsafe git remote"));
        }
        let url = url::Url::parse(remote).map_err(|e| {
            EnvdenError::with_source(ErrorCode::InvalidInput, "Unsafe git remote", e)
        })?;
        if url.host_str().is_none()
            || url.query().is_some_and(|s| !s.is_empty())
            || url.fragment().is_some_and(|s| !s.is_empty())
        {
            return Err(error("Unsupported git remote"));
        }
        return Ok((
            url.host_str().unwrap().into(),
            decode(url.path())?,
            scheme == "ssh",
        ));
    }
    let captures = regex::Regex::new(r"^(?:[^@/\s]+@)?(\[[^\]]+\]|[^:/\s]+):(.+)$")
        .unwrap()
        .captures(remote)
        .ok_or_else(|| error("A hosted git remote is required"))?;
    Ok((captures[1].into(), captures[2].into(), true))
}

pub fn normalize_repo_id(remote: &str, hostname: Option<&str>) -> Result<String> {
    if controls(&decode(remote)?) {
        return Err(error("Unsafe git remote"));
    }
    let (host, path, _) = parts(remote.trim())?;
    let host = hostname.unwrap_or(&host).to_lowercase();
    let mut path = path.trim_matches('/').to_owned();
    if path.to_ascii_lowercase().ends_with(".git") {
        path.truncate(path.len() - 4);
    }
    if host == "github.com" || host == "gitlab.com" {
        path = path.to_lowercase();
    }
    if host.is_empty()
        || host.contains(['\\', '/'])
        || host.chars().any(char::is_whitespace)
        || controls(&host)
        || controls(&path)
        || path.contains('\\')
        || path
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
    {
        return Err(error("Unsafe git remote"));
    }
    Ok(format!("{host}/{path}"))
}

pub(crate) fn resolve_host(host: &str) -> Result<String> {
    resolve_host_with(host, |command, args| {
        let output = exec_trusted(command, args, &ISpawnOptions::default())?;
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    })
}

pub(crate) fn resolve_host_with(
    host: &str,
    run: impl FnOnce(&str, &[String]) -> Result<String>,
) -> Result<String> {
    if host.starts_with('-')
        || host.is_empty()
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return Err(error("Unsafe SSH host"));
    }
    let output = run("ssh", &["-G", "--", host].map(str::to_owned))?;
    output
        .lines()
        .find_map(|s| s.strip_prefix("hostname ").map(|s| s.trim().to_owned()))
        .ok_or_else(|| EnvdenError::new(ErrorCode::Internal, "SSH hostname resolution failed"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn vectors() {
        let vectors = include_str!(
            "../../../../../packages/adapters/repo/git/src/__tests__/repo-id-vectors.json"
        );
        let vectors: serde_json::Value = serde_json::from_str(vectors).unwrap();
        for row in vectors.as_array().unwrap() {
            assert_eq!(
                normalize_repo_id(
                    row["remote"].as_str().unwrap(),
                    row.get("hostname").and_then(|v| v.as_str())
                )
                .unwrap(),
                row["expected"].as_str().unwrap()
            );
        }
    }
}
