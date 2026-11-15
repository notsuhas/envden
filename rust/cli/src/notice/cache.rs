use super::remote::read_remote_notice;
use crate::{
    output::sanitize_terminal,
    state::{
        files::{atomic_write, optional_read},
        lock::with_state_lock,
    },
    sync::local::files::{base_path, read_bytes},
};
use envden_core::errors::Result;
use serde_json::Value;
use std::path::Path;

pub fn notice_status(home: &Path, state: &Value) -> Result<Vec<String>> {
    let mut repos = Vec::new();
    for link in state["links"].as_array().into_iter().flatten() {
        if link["localOnly"] == true {
            continue;
        }
        let store = link["store"].as_str().unwrap_or("");
        let root = link["root"].as_str().unwrap_or("");
        let copy = link["mode"] == "copy";
        let base = read_bytes(&base_path(
            home,
            store,
            if copy { Some(root) } else { None },
        ))?;
        let local_path = if copy {
            Path::new(root).join(link["path"].as_str().unwrap_or(""))
        } else {
            store.into()
        };
        if base == read_bytes(&local_path)? {
            continue;
        }
        if let Some(checkout) = state["approved"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|c| c["root"] == link["root"])
        {
            let repo = checkout["repoId"].as_str().unwrap_or("");
            let repo = state["aliases"][repo].as_str().unwrap_or(repo).to_string();
            if !repos.contains(&repo) {
                repos.push(repo);
            }
        }
    }
    Ok(repos)
}

pub fn refresh_notice(
    home: &Path,
    state: &Value,
    case_insensitive: impl Fn(&str) -> Result<bool>,
    now: u64,
) -> Result<()> {
    with_state_lock(home, now, || {
        let roots: Vec<_> = state["approved"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|c| c["root"].as_str())
            .filter(|s| safe_root(s))
            .collect();
        atomic_write(
            &home.join("state/approved-checkouts"),
            format!("{}\n", roots.join("\n")).as_bytes(),
            now,
        )?;
        let insensitive: Vec<_> = roots
            .iter()
            .filter(|root| case_insensitive(root).unwrap_or(false))
            .copied()
            .collect();
        atomic_write(
            &home.join("state/approved-checkouts-insensitive"),
            format!("{}\n", insensitive.join("\n")).as_bytes(),
            now,
        )?;
        let mut repos = notice_status(home, state)?;
        if let Some(remote) = read_remote_notice(home)? {
            for repo in remote.repos {
                if !repos.contains(&repo) {
                    repos.push(repo);
                }
            }
        }
        let lines = repos
            .iter()
            .map(|r| format!("envden: {} out of sync\n", sanitize_terminal(r)))
            .collect::<String>();
        atomic_write(&home.join("state/notice"), lines.as_bytes(), now)
    })
}

pub fn safe_root(root: &str) -> bool {
    !root.is_empty() && sanitize_terminal(root) == root && !root.contains(['\r', '\n'])
}

pub fn cached_notice(home: &Path) -> Result<String> {
    Ok(optional_read(&home.join("state/notice"))?
        .unwrap_or_default()
        .split('\n')
        .map(sanitize_terminal)
        .collect::<Vec<_>>()
        .join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn local_and_remote_order_and_safe_roots() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path();
        let store = home.join("file");
        std::fs::write(&store, b"A=1").unwrap();
        let state = json!({"approved":[{"root":"/checkout","repoId":"host/repo"},{"root":"bad\nroot","repoId":"other"}],"aliases":{},"links":[{"root":"/checkout","path":".env","store":store,"mode":"link"}]});
        super::super::remote::write_remote_notice(
            home,
            &super::super::remote::IRemoteNotice {
                checked_at: 1.0,
                repos: vec!["remote/repo".into(), "host/repo".into()],
            },
            1,
        )
        .unwrap();
        refresh_notice(home, &state, |_| Ok(false), 1).unwrap();
        assert_eq!(
            cached_notice(home).unwrap(),
            "envden: host/repo out of sync\nenvden: remote/repo out of sync\n"
        );
        assert_eq!(
            std::fs::read_to_string(home.join("state/approved-checkouts")).unwrap(),
            "/checkout\n"
        );
    }
}
