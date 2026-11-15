use serde_json::Value;

fn forbidden(c: char) -> bool {
    matches!(c, '\u{0000}'..='\u{001f}' | '\u{007f}'..='\u{009f}' | '\u{061c}' | '\u{200e}' | '\u{200f}' | '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
}

pub fn sanitize_terminal(value: &str) -> String {
    value.chars().filter(|&c| !forbidden(c)).collect()
}

pub fn sanitize_console(value: &str) -> String {
    value
        .chars()
        .filter(|&c| c == '\n' || c == '\t' || !forbidden(c))
        .collect()
}

pub fn terminal_json(value: &Value) -> String {
    fn clean(value: &Value) -> Value {
        match value {
            Value::String(s) => Value::String(sanitize_terminal(s)),
            Value::Array(a) => Value::Array(a.iter().map(clean).collect()),
            Value::Object(o) => {
                Value::Object(o.iter().map(|(k, v)| (k.clone(), clean(v))).collect())
            }
            other => other.clone(),
        }
    }
    clean(value).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn strips_controls_and_bidi() {
        assert_eq!(sanitize_terminal("ok\n\t\x1b[31m\u{202e}bad"), "ok[31mbad");
        assert_eq!(sanitize_console("a\n\tb\x00"), "a\n\tb");
    }
}
