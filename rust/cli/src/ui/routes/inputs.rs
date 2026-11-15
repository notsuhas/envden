use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

pub fn parse<'a>(
    input: &'a Value,
    keys: &[&str],
    message: &'static str,
) -> Result<&'a serde_json::Map<String, Value>> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidInput, message);
    let object = input.as_object().ok_or_else(invalid)?;
    if object.len() != keys.len() || keys.iter().any(|k| !object.contains_key(*k)) {
        return Err(invalid());
    }
    for key in keys {
        let valid = if *key == "version" {
            object[*key]
                .as_u64()
                .is_some_and(|v| v > 0 && v <= 9_007_199_254_740_991)
        } else {
            object[*key].as_str().is_some_and(|v| {
                !v.is_empty() && v.encode_utf16().count() <= if *key == "name" { 256 } else { 4096 }
            })
        };
        if !valid {
            return Err(invalid());
        }
    }
    if keys.contains(&"root")
        && !std::path::Path::new(object["root"].as_str().unwrap()).is_absolute()
    {
        return Err(invalid());
    }
    if keys.contains(&"choice")
        && !matches!(object["choice"].as_str(), Some("keep-mine" | "take-server"))
    {
        return Err(invalid());
    }
    Ok(object)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn strict_route_inputs_reject_missing_extra_and_invalid_fields() {
        for input in [
            json!(null),
            json!({}),
            json!({"name":""}),
            json!({"name":"a","extra":1}),
            json!({"name":1}),
            json!({"name":"a".repeat(257)}),
        ] {
            assert_eq!(
                parse(&input, &["name"], "Enter a device name")
                    .unwrap_err()
                    .message,
                "Enter a device name"
            );
        }
        assert!(parse(&json!({"name":"a"}), &["name"], "name").is_ok());
        for input in [
            json!({"root":"relative","path":".env"}),
            json!({"root":"/a","path":""}),
        ] {
            assert!(parse(&input, &["root", "path"], "file").is_err());
        }
        assert!(
            parse(
                &json!({"root":"/a","path":".env","version":0}),
                &["root", "path", "version"],
                "version"
            )
            .is_err()
        );
        assert!(
            parse(
                &json!({"id":"a","choice":"keep-mine"}),
                &["id", "choice"],
                "resolve"
            )
            .is_ok()
        );
        assert!(
            parse(
                &json!({"id":"a","choice":"other"}),
                &["id", "choice"],
                "resolve"
            )
            .is_err()
        );
    }
}
