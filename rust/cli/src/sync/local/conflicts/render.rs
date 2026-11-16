use super::IConflictRecord;
use crate::output::sanitize_console;
use std::path::Path;

pub fn conflicts_text(records: &[IConflictRecord]) -> String {
    if records.is_empty() {
        return "No conflicts".into();
    }
    let mut lines = vec!["Conflicts:".into()];
    for record in records {
        let note = if record.deleted {
            " (deleted on the server)"
        } else if record.mine_deleted {
            " (deleted here)"
        } else {
            ""
        };
        lines.push(format!(
            "  {}{note}",
            Path::new(&record.root).join(&record.path).display()
        ));
        lines.push(format!("    edit {}", record.file));
        for path in &record.alternatives {
            lines.push(format!("    saved {}: {path}", saved_source(record, path)));
        }
    }
    lines.push(
        "Edit the file, then run envden resolve <file>, or pass --keep-mine or --take-server"
            .into(),
    );
    sanitize_console(&lines.join("\n"))
}

fn saved_source(record: &IConflictRecord, path: &str) -> String {
    let index = path.rsplit_once(".variant-").and_then(|(_, i)| {
        if i.is_empty() || !i.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        i.parse::<usize>().ok()
    });
    match index {
        Some(0) => "this device".into(),
        Some(1) => "server".into(),
        Some(index) => record
            .targets
            .get(index - 2)
            .map(|t| {
                Path::new(&t.root)
                    .join(&record.path)
                    .to_string_lossy()
                    .into_owned()
            })
            .unwrap_or_else(|| "copy".into()),
        None => "copy".into(),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn saved_source_matches_javascript_digit_suffix() {
        let record: super::IConflictRecord = serde_json::from_value(serde_json::json!({
            "file":"", "server":"", "mine":"", "base":"", "root":"", "path":".env", "store":"", "mode":"copy", "targets":[], "deleted":false, "remote":"", "alternatives":[], "entry":null, "mineDeleted":false
        })).unwrap();
        for (suffix, expected) in [
            ("+1", "copy"),
            ("1\n", "copy"),
            ("1\r", "copy"),
            ("1\r\n", "copy"),
            ("1\u{2028}", "copy"),
            ("01", "server"),
            ("1x", "copy"),
        ] {
            assert_eq!(
                super::saved_source(&record, &format!("file.variant-{suffix}")),
                expected,
                "{suffix:?}"
            );
        }
    }
}
