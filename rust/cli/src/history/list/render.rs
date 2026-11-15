use envden_core::errors::Result;
use serde_json::Value;

pub fn changes_text(changes: &Value) -> String {
    if changes == "unknown" {
        return "changes unknown".into();
    }
    if changes == "unparsed" {
        return "changed (file not parsable)".into();
    }
    let mut parts = Vec::new();
    for key in ["added", "changed", "removed"] {
        let keys: Vec<_> = changes[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .collect();
        if !keys.is_empty() {
            parts.push(format!("{key} {}", keys.join(", ")));
        }
    }
    if parts.is_empty() {
        "no key changes".into()
    } else {
        parts.join("; ")
    }
}

pub fn history_text(result: &Value, now: u64) -> Result<String> {
    let mut files = Vec::new();
    for file in result["files"].as_array().into_iter().flatten() {
        let checkouts = file["checkouts"].as_array().unwrap();
        let single = checkouts.len() == 1;
        let mut lines = vec![format!(
            "{} {}",
            file["repoId"].as_str().unwrap_or_default(),
            file["path"].as_str().unwrap_or_default()
        )];
        for version in file["versions"].as_array().into_iter().flatten() {
            let time = version["time"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|t| crate::time::when_text(t.timestamp_millis(), now as i64, None))
                .transpose()?
                .unwrap_or_else(|| "unknown time".into());
            let device =
                version["device"]
                    .as_str()
                    .unwrap_or(if version["removedDevice"] == true {
                        "removed device"
                    } else {
                        "unknown device"
                    });
            let changes = changes_text(&version["changes"]);
            let kind = match version["kind"].as_str() {
                Some("deleted") => "deleted".into(),
                Some("lost") => "lost in a server repair".into(),
                Some("restored") => format!("restored by a server repair; {changes}"),
                _ => changes,
            };
            let mut columns = vec![
                format!("  v{}", version["version"]),
                column(&time, 42),
                column(device, 16),
                kind,
            ];
            for checkout in checkouts
                .iter()
                .filter(|c| c["version"] == version["version"])
            {
                columns.push(if single {
                    "<- current".into()
                } else {
                    format!(
                        "<- current in {}",
                        checkout["root"].as_str().unwrap_or_default()
                    )
                });
            }
            lines.push(columns.join("  "));
        }
        if file["versions"].as_array().is_none_or(|v| v.is_empty()) {
            lines.push("  no retained versions".into());
        }
        if file["pruned"] == true {
            lines.push("  older versions pruned".into());
        }
        for checkout in checkouts.iter().filter(|c| c.get("version").is_none()) {
            lines.push(format!(
                "  {} matches no retained version",
                if single {
                    "This checkout"
                } else {
                    checkout["root"].as_str().unwrap_or_default()
                }
            ));
        }
        files.push(lines.join("\n"));
    }
    Ok(if files.is_empty() {
        "No env files to show".into()
    } else {
        crate::output::sanitize_console(&files.join("\n\n"))
    })
}

fn column(value: &str, width: usize) -> String {
    format!(
        "{value}{}",
        " ".repeat(width.saturating_sub(unicode_width::UnicodeWidthStr::width(value)))
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn device_columns_are_padded_by_terminal_cells() {
        let result = json!({"files":[{"repoId":"host/repo","path":".env","checkouts":[],"versions":[{"version":1,"kind":"live","device":"日本","changes":"unknown"}]}]});
        let rendered = history_text(&result, 1).unwrap();
        assert_eq!(
            rendered,
            format!(
                "host/repo .env\n  v1  {:42}  日本{}  changes unknown",
                "unknown time",
                " ".repeat(12)
            )
        );
    }
}
