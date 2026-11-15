use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(crate) fn conflict(stdout: &str, hostname: &str, port: u16, target: &str) -> Result<bool> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidData, "Invalid Tailscale serve status");
    let mut value: Value = serde_json::from_str(if stdout.trim().is_empty() {
        "{}"
    } else {
        stdout
    })
    .map_err(|e| {
        EnvdenError::with_source(ErrorCode::InvalidData, "Invalid Tailscale serve status", e)
    })?;
    if value.is_null() {
        value = serde_json::json!({});
    }
    if !value.is_object() {
        return Err(invalid());
    }
    if let Some(tcp) = value.get("TCP") {
        for item in tcp.as_object().ok_or_else(invalid)?.values() {
            if !item.is_object() || item.get("TCPForward").is_some_and(|v| !v.is_string()) {
                return Err(invalid());
            }
        }
    }
    if let Some(web) = value.get("Web") {
        for item in web.as_object().ok_or_else(invalid)?.values() {
            let handlers = item
                .get("Handlers")
                .and_then(Value::as_object)
                .ok_or_else(invalid)?;
            if handlers
                .values()
                .any(|v| !v.is_object() || v.get("Proxy").is_some_and(|p| !p.is_string()))
            {
                return Err(invalid());
            }
        }
    }
    let listener = value.get("TCP").and_then(|v| v.get(port.to_string()));
    let site = value
        .get("Web")
        .and_then(|v| v.get(format!("{hostname}:{port}")));
    if listener.is_none() && site.is_none() {
        return Ok(false);
    }
    if listener
        .and_then(|v| v.get("TCPForward"))
        .and_then(Value::as_str)
        .is_some_and(|s| !s.is_empty())
        || site.is_none()
    {
        return Ok(true);
    }
    let handlers = site.unwrap()["Handlers"].as_object().unwrap();
    Ok(!(handlers.len() == 1
        && handlers
            .get("/")
            .and_then(|v| v.get("Proxy"))
            .and_then(Value::as_str)
            == Some(target)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conflicts_and_invalid_schemas() {
        for (value, expected) in [
            ("", false),
            ("null", false),
            ("{}", false),
            (r#"{"TCP":{"8080":{"HTTPS":true}}}"#, true),
            (r#"{"TCP":{"8080":{"TCPForward":"other"}}}"#, true),
            (
                r#"{"Web":{"host:8080":{"Handlers":{"/":{"Proxy":"target"}}}}}"#,
                false,
            ),
            (
                r#"{"Web":{"host:8080":{"Handlers":{"/":{"Proxy":"other"}}}}}"#,
                true,
            ),
            (
                r#"{"Web":{"host:8080":{"Handlers":{"/":{"Proxy":"target"},"/extra":{}}}}}"#,
                true,
            ),
            (r#"{"Web":{"other:8080":{"Handlers":{}}}}"#, false),
        ] {
            assert_eq!(conflict(value, "host", 8080, "target").unwrap(), expected);
        }
        for value in [
            "[]",
            "bad",
            r#"{"TCP":null}"#,
            r#"{"TCP":{"80":{"TCPForward":3}}}"#,
            r#"{"Web":{"host:80":{}}}"#,
        ] {
            assert_eq!(
                conflict(value, "host", 80, "target").unwrap_err().code,
                ErrorCode::InvalidData
            );
        }
    }
}
