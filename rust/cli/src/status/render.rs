use crate::{
    output::{home_path, sanitize_console},
    state::NOT_SET_UP,
};
use serde_json::Value;
use std::{collections::HashSet, path::Path};

pub fn status_text(report: &Value, cwd: &Path, user_home: &Path) -> String {
    let mut lines = if report["configured"] != true {
        vec![NOT_SET_UP.into()]
    } else {
        configured_lines(report, cwd, user_home)
    };
    if let Some(message) = report["update"]["message"].as_str() {
        lines.push(message.into());
    }
    sanitize_console(&lines.join("\n"))
}

fn configured_lines(report: &Value, cwd: &Path, user_home: &Path) -> Vec<String> {
    let files: Vec<_> = report["files"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|f| f["state"] != "local-only")
        .collect();
    let groups = [
        (
            &["changed", "diverged"][..],
            "Changed here (run envden push)",
        ),
        (
            &["remote", "diverged"][..],
            "Newer on server (run envden pull)",
        ),
        (&["conflict"][..], "Conflicts (run envden resolve --list)"),
        (&["detached"][..], "Detached (run envden pull)"),
        (&["missing"][..], "Missing here (run envden pull)"),
    ];
    let mut pending = Vec::new();
    for (states, label) in groups {
        let names: Vec<_> = files
            .iter()
            .filter(|f| states.contains(&f["state"].as_str().unwrap_or_default()))
            .map(|f| display(f, cwd, user_home))
            .collect();
        if !names.is_empty() {
            pending.push(format!("{label}: {}", names.join(", ")));
        }
    }
    for file in files.iter().filter(|f| f["state"] == "held-back") {
        pending.push(format!(
            "Held back: {}: {}",
            display(file, cwd, user_home),
            file["reason"].as_str().unwrap_or("run envden doctor")
        ));
    }
    if pending.is_empty() && report["server"] == "reachable" && report["serverChecked"] == true {
        if files.is_empty() {
            return vec!["Nothing tracked yet. Run envden track in a checkout.".into()];
        }
        let repos = files
            .iter()
            .map(|f| f.get("repoId").unwrap_or(&f["root"]))
            .collect::<HashSet<_>>()
            .len();
        return vec![format!(
            "In sync: {repos} repo{}, {} env file{}. Server reachable.",
            if repos == 1 { "" } else { "s" },
            files.len(),
            if files.len() == 1 { "" } else { "s" }
        )];
    }
    let server = if report["server"] != "reachable" {
        format!(
            "Server: {} ({})",
            report["server"].as_str().unwrap_or_default(),
            report["serverReason"].as_str().unwrap_or_default()
        )
    } else if report["serverChecked"] == true {
        "Server: reachable".into()
    } else {
        "Server: reachable, but couldn't check it for newer changes".into()
    };
    if pending.is_empty() {
        pending.push("No changes here".into());
    }
    let mut lines = vec![server];
    lines.extend(pending);
    lines
}

fn display(file: &Value, cwd: &Path, user_home: &Path) -> String {
    let path = Path::new(file["root"].as_str().unwrap_or_default())
        .join(file["path"].as_str().unwrap_or_default());
    path.strip_prefix(cwd)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| home_path(&path, user_home))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn reference_groups() {
        let report = json!({"configured":true,"server":"reachable","serverChecked":true,"files":[{"root":"/work","path":".env","state":"diverged"}]});
        assert_eq!(
            status_text(&report, Path::new("/work"), Path::new("/home")),
            "Server: reachable\nChanged here (run envden push): .env\nNewer on server (run envden pull): .env"
        );
    }
}
