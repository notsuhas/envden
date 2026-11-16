use base64::{
    Engine, alphabet,
    engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig},
};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    text::js_trim,
};
use serde_json::{Value, json};

pub(super) fn revive(value: &mut Value) -> Result<()> {
    match value {
        Value::Array(items) => {
            for item in items {
                revive(item)?;
            }
        }
        Value::Object(record) => {
            for item in record.values_mut() {
                revive(item)?;
            }
            if let Some(items) = record.get("$map").and_then(Value::as_array) {
                let mut entries: Vec<Value> = Vec::new();
                for item in items {
                    let (key, value) = match item {
                        Value::Array(pair) => (
                            pair.first().cloned().unwrap_or(Value::Null),
                            pair.get(1).cloned().unwrap_or(Value::Null),
                        ),
                        Value::Object(pair) => (
                            pair.get("0").cloned().unwrap_or(Value::Null),
                            pair.get("1").cloned().unwrap_or(Value::Null),
                        ),
                        _ => return Err(invalid()),
                    };
                    if let Some(existing) =
                        entries.iter_mut().find(|entry| same_key(&entry[0], &key))
                    {
                        existing[1] = value;
                    } else {
                        entries.push(json!([key, value]));
                    }
                }
                *value = json!({"$map":entries});
            } else if let Some(items) = record.get("$set").and_then(Value::as_array) {
                let mut unique = Vec::new();
                for item in items {
                    if !unique.iter().any(|existing| same_key(existing, item)) {
                        unique.push(item.clone());
                    }
                }
                *value = json!({"$set":unique});
            } else if let Some(text) = record.get("$bigint").and_then(Value::as_str) {
                *value = json!({"$bigint":bigint(text)?});
            } else if let Some(text) = record.get("$bytes").and_then(Value::as_str) {
                let bytes = buffer_bytes(text);
                *value = json!({"$bytes":base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)});
            }
        }
        _ => {}
    }
    Ok(())
}

fn same_key(a: &Value, b: &Value) -> bool {
    let bigint = a.get("$bigint").and_then(Value::as_str);
    if let Some(bigint) = bigint {
        return b.get("$bigint").and_then(Value::as_str) == Some(bigint);
    }
    !a.is_object() && !a.is_array() && !b.is_object() && !b.is_array() && a == b
}

fn bigint(text: &str) -> Result<String> {
    let text = js_trim(text);
    if text.is_empty() {
        return Ok("0".into());
    }
    let (digits, radix) = match text.get(..2) {
        Some("0x" | "0X") => (&text[2..], 16),
        Some("0o" | "0O") => (&text[2..], 8),
        Some("0b" | "0B") => (&text[2..], 2),
        _ => (text, 10),
    };
    num_bigint::BigInt::parse_bytes(digits.as_bytes(), radix)
        .map(|v| v.to_string())
        .ok_or_else(invalid)
}

fn buffer_bytes(text: &str) -> Vec<u8> {
    let mut input: String = text
        .chars()
        .take_while(|c| *c != '=')
        .filter_map(|c| match c {
            '-' => Some('+'),
            '_' => Some('/'),
            c if c.is_ascii_alphanumeric() || c == '+' || c == '/' => Some(c),
            _ => None,
        })
        .collect();
    if input.len() % 4 == 1 {
        input.pop();
    }
    let config = GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true);
    GeneralPurpose::new(&alphabet::STANDARD, config)
        .decode(input)
        .unwrap_or_default()
}

fn invalid() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, "Unreadable local state")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_match_javascript_revival_and_reserialization() {
        for (source, expected) in [
            (json!({"$bigint":" 0x10 "}), json!({"$bigint":"16"})),
            (json!({"$bigint":""}), json!({"$bigint":"0"})),
            (json!({"$bytes":"_w== ignored"}), json!({"$bytes":"_w"})),
            (
                json!({"$set":[{"$bigint":"1"},{"$bigint":"01"}]}),
                json!({"$set":[{"$bigint":"1"}]}),
            ),
            (json!({"$map":[["x",1],["x",2]]}), json!({"$map":[["x",2]]})),
        ] {
            let mut value = source;
            revive(&mut value).unwrap();
            assert_eq!(value, expected);
        }
    }
}
