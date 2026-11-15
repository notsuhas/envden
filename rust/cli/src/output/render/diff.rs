use serde_json::Value;

pub fn diff_text(files: &[Value]) -> String {
    let changed: Vec<_> = files.iter().filter(|f| f["differs"] == true).collect();
    if changed.is_empty() {
        return "No changes since the last sync".into();
    }
    crate::output::sanitize_console(
        &changed
            .iter()
            .map(|file| {
                let name = std::path::Path::new(file["root"].as_str().unwrap_or_default())
                    .join(file["path"].as_str().unwrap_or_default())
                    .display()
                    .to_string();
                if file["kind"] == "conflict" {
                    return format!(
                        "{name}\n  can't compare keys: {}",
                        file["reason"]
                            .as_str()
                            .unwrap_or_default()
                            .replace('-', " ")
                    );
                }
                let mut lines = vec![name];
                for (key, prefix) in [("added", "+"), ("removed", "-"), ("changed", "~")] {
                    if let Some(keys) = file[key].as_array() {
                        for key in keys {
                            lines.push(format!("  {prefix} {}", key.as_str().unwrap_or_default()));
                        }
                    }
                }
                if lines.len() == 1 {
                    lines.push("  only comments or formatting changed".into());
                }
                lines.join("\n")
            })
            .collect::<Vec<_>>()
            .join("\n\n"),
    )
}
