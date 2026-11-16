use crate::output::{home_path, sanitize_terminal};
use envden_core::filesystem::ICanonicalPath;
use serde_json::Value;
use std::path::Path;

pub(super) fn summary(state: &Value, home: &Path, setup: bool) -> Vec<String> {
    let real_home = home.canonical_path().unwrap_or_else(|_| home.to_owned());
    let home = real_home.as_path();
    let links: Vec<_> = state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|v| v["localOnly"] != true)
        .collect();
    let mut roots = vec![];
    for link in &links {
        let root = home_path(Path::new(link["root"].as_str().unwrap_or_default()), home);
        if !roots.contains(&root) {
            roots.push(root);
        }
    }
    let files = if links.is_empty() {
        None
    } else {
        Some(format!(
            "{} env {} in {}",
            links.len(),
            if links.len() == 1 { "file" } else { "files" },
            if roots.len() > 3 {
                format!("{} checkouts", roots.len())
            } else {
                roots.join(", ")
            }
        ))
    };
    let name = state["deviceName"].as_str().unwrap_or_default();
    if setup {
        vec![
            sanitize_terminal(&format!(
                "Setup complete. Vault on {}, this device is {name}, {}.",
                state["server"]["address"].as_str().unwrap_or("the server"),
                files
                    .as_ref()
                    .map(|v| format!("tracking {v}"))
                    .unwrap_or_else(|| "tracking no env files yet".into())
            )),
            if files.is_some() {
                "Add another device with: envden device add".into()
            } else {
                "Track a checkout with: envden track <path>".into()
            },
        ]
    } else {
        vec![sanitize_terminal(&format!(
            "Joined as {name}. {}",
            files
                .map(|v| format!("Synced {v}."))
                .unwrap_or_else(|| "No env files synced yet.".into())
        ))]
    }
}
