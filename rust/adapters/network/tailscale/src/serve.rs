use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub(crate) fn conflict(stdout: &str, hostname: &str, port: u16, target: &str) -> Result<bool> {
    let stdout = envden_core::text::js_trim(stdout);
    let invalid = || {
        EnvdenError::with_source(
            ErrorCode::InvalidData,
            "Invalid Tailscale serve status",
            std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "Invalid Tailscale serve status schema",
            ),
        )
    };
    let mut value: Value = serde_json::from_str(if stdout.is_empty() { "{}" } else { stdout })
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
            ("\u{feff}{}\u{feff}", false),
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
        let host = "laptop.tail.example";
        let port = 4280;
        let target = "http://127.0.0.1:4280";
        let site = |handlers| {
            serde_json::json!({"TCP":{"4280":{"HTTPS":true}},"Web":{"laptop.tail.example:4280":{"Handlers":handlers}}}).to_string()
        };
        for (value, expected) in [
            ("{}".into(), false),
            ("".into(), false),
            ("null".into(), false),
            (site(serde_json::json!({"/":{"Proxy":target}})), false),
            (site(serde_json::json!({"/":{"Proxy":"http://127.0.0.1:3000"}})), true),
            (site(serde_json::json!({"/":{"Proxy":target},"/app":{"Proxy":target}})), true),
            (r#"{"TCP":{"4280":{"TCPForward":"127.0.0.1:22"}}}"#.into(), true),
            (r#"{"TCP":{"4280":{"HTTPS":true}}}"#.into(), true),
            (r#"{"TCP":{"443":{"HTTPS":true}},"Web":{"laptop.tail.example:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:3773"}}}}}"#.into(), false),
            (r#"{"Web":{"x.tail.example:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:1"}}}}}"#.into(), false),
        ] { assert_eq!(conflict(&value,host,port,target).unwrap(),expected); }
        assert_eq!(
            conflict("bad json", host, port, target).unwrap_err().code,
            ErrorCode::InvalidData
        );
        for value in [
            "[]",
            "bad",
            "bad json",
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

#[cfg(test)]
mod source_tests {
    #[test]
    fn schema_failure_keeps_cause() {
        let error = super::conflict(r#"{"TCP":null}"#, "host", 80, "target").unwrap_err();
        assert!(error.source.is_some());
    }
}
