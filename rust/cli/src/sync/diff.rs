use super::{
    local::{
        files::{base_path, read_bytes},
        selection::selected_repos,
    },
    remote::context::{ISyncOptions, sync_context},
};
use crate::{
    adapters::IAdapters, client::ITransport, links::checkout::repo::checkout_repo,
    state::lock::with_state_lock,
};
use envden_core::{errors::Result, merge::diff_env_keys};
use serde_json::{Value, json};
use std::{collections::HashSet, path::Path, rc::Rc};

pub fn diff(
    adapters: &IAdapters,
    options: ISyncOptions,
    transport: Rc<dyn ITransport>,
) -> Result<Vec<Value>> {
    with_state_lock(&adapters.home, (options.now)(), || {
        let mut context = sync_context(adapters, options, transport)?;
        let cwd = match &context.options.cwd {
            Some(path) => path.clone(),
            None => std::env::current_dir().map_err(crate::state::files::failure)?,
        };
        let repos = selected_repos(
            adapters,
            &mut context.state,
            &cwd,
            context.options.all,
            &mut HashSet::new(),
            &|_| {},
        )?;
        let mut result = Vec::new();
        for link in context.state["links"].as_array().into_iter().flatten() {
            if !include_link(&context.state, link, &repos) {
                continue;
            }
            let root = link["root"].as_str().unwrap_or_default();
            let path = link["path"].as_str().unwrap_or_default();
            let store = link["store"].as_str().unwrap_or_default();
            let before = read_bytes(&base_path(
                &adapters.home,
                store,
                if link["mode"] == "copy" {
                    Some(root)
                } else {
                    None
                },
            ))?;
            let after = read_bytes(&if link["mode"] == "link" {
                Path::new(store).to_owned()
            } else {
                Path::new(root).join(path)
            })?;
            let mut record = json!({"root":root,"path":path,"differs":before != after});
            match diff_env_keys(
                before.as_deref().unwrap_or_default(),
                after.as_deref().unwrap_or_default(),
            ) {
                Ok(diff) => {
                    record["kind"] = "diff".into();
                    record["added"] = json!(diff.added);
                    record["removed"] = json!(diff.removed);
                    record["changed"] = json!(diff.changed);
                }
                Err(conflict) => {
                    record["kind"] = "conflict".into();
                    record["reason"] = conflict.reason.into();
                    if let Some(key) = conflict.key {
                        record["key"] = key.into();
                    }
                }
            }
            result.push(record);
        }
        Ok(result)
    })
}

pub fn include_link(state: &Value, link: &Value, repos: &HashSet<String>) -> bool {
    link["localOnly"] != true
        && checkout_repo(state, link["root"].as_str().unwrap_or_default())
            .is_some_and(|repo| repos.contains(repo))
}

pub fn diff_text(files: &[Value]) -> String {
    let changed: Vec<_> = files.iter().filter(|f| f["differs"] == true).collect();
    if changed.is_empty() {
        return "No changes since the last sync".into();
    }
    let texts: Vec<_> = changed
        .iter()
        .map(|file| {
            let name = Path::new(file["root"].as_str().unwrap_or_default())
                .join(file["path"].as_str().unwrap_or_default())
                .to_string_lossy()
                .into_owned();
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
            for (field, marker) in [("added", "+"), ("removed", "-"), ("changed", "~")] {
                for key in file[field]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                {
                    lines.push(format!("  {marker} {key}"));
                }
            }
            if lines.len() == 1 {
                lines.push("  only comments or formatting changed".into());
            }
            lines.join("\n")
        })
        .collect();
    crate::output::sanitize_console(&texts.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diff_selection_respects_approval_aliases_and_local_only() {
        let state =
            json!({"approved":[{"root":"/a","repoId":"fork"}],"aliases":{"fork":"canonical"}});
        let repos = HashSet::from(["canonical".into()]);
        assert!(include_link(&state, &json!({"root":"/a"}), &repos));
        assert!(!include_link(&state, &json!({"root":"/b"}), &repos));
        assert!(!include_link(
            &state,
            &json!({"root":"/a","localOnly":true}),
            &repos
        ));
    }
    #[test]
    fn renders_only_key_names_and_formatting_changes() {
        assert_eq!(diff_text(&[]), "No changes since the last sync");
        assert_eq!(
            diff_text(&[json!({"root":"/a","path":".env","differs":false})]),
            "No changes since the last sync"
        );
        assert_eq!(
            diff_text(&[
                json!({"root":"/a","path":".env","differs":true,"kind":"diff","added":["A"],"removed":["B"],"changed":["C"]})
            ]),
            format!(
                "{}\n  + A\n  - B\n  ~ C",
                std::path::Path::new("/a").join(".env").display()
            )
        );
        assert_eq!(
            diff_text(&[
                json!({"root":"/a","path":".env","differs":true,"kind":"diff","added":[],"removed":[],"changed":[]})
            ]),
            format!(
                "{}\n  only comments or formatting changed",
                std::path::Path::new("/a").join(".env").display()
            )
        );
        assert_eq!(
            diff_text(&[
                json!({"root":"/a","path":".env","differs":true,"kind":"conflict","reason":"invalid-utf8"})
            ]),
            format!(
                "{}\n  can't compare keys: invalid utf8",
                std::path::Path::new("/a").join(".env").display()
            )
        );
    }
}
