use super::ICommand;
use serde_json::Value;

pub(super) fn option_value(
    command: &ICommand,
    option: &super::IOption,
    value: Value,
) -> Result<Value, String> {
    if option.name != "port" {
        return Ok(value);
    }
    let text = value.as_str().unwrap_or_default();
    if command.name == "serve" {
        let port = text.parse::<u32>().ok().filter(|p| {
            *p <= 65535
                && !text.is_empty()
                && text.len() <= 5
                && text.bytes().all(|b| b.is_ascii_digit())
        });
        return port.map(Value::from).ok_or_else(|| format!("error: option '{}' argument '{}' is invalid. Expected a port from 0 (any free port) to 65535.", option.flags, text));
    }
    if command.name == "ui" {
        return Ok(js_number(text)
            .and_then(serde_json::Number::from_f64)
            .map_or(Value::Null, Value::Number));
    }
    Ok(value)
}

fn js_number(text: &str) -> Option<f64> {
    let text = envden_core::text::js_trim(text);
    if text.is_empty() {
        return Some(0.0);
    }
    for (prefixes, radix) in [(["0x", "0X"], 16), (["0b", "0B"], 2), (["0o", "0O"], 8)] {
        if let Some(digits) = prefixes.iter().find_map(|prefix| text.strip_prefix(prefix)) {
            if digits.is_empty() || digits.starts_with(['+', '-']) {
                return None;
            }
            return u64::from_str_radix(digits, radix).ok().map(|n| n as f64);
        }
    }
    text.parse().ok()
}
