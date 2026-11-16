use envden_core::adapters::ICheckout;
use serde_json::{Value, json};

pub fn checkout_value(checkout: &ICheckout) -> Value {
    let mut value =
        json!({"root":checkout.root,"repoId":checkout.repo_id,"gitDir":checkout.git_dir});
    for (key, field) in [
        ("upstreamRepoId", checkout.upstream_repo_id.as_ref()),
        ("identity", checkout.identity.as_ref()),
    ] {
        if let Some(field) = field {
            value[key] = field.clone().into();
        }
    }
    if let Some(device) = checkout.root_device {
        value["rootDevice"] = device.into();
    }
    if let Some(registered) = checkout.registered_worktree {
        value["registeredWorktree"] = registered.into();
    }
    value
}

pub fn repo_of<'a>(state: &'a Value, repo: &'a str) -> &'a str {
    state["aliases"][repo].as_str().unwrap_or(repo)
}

pub fn checkout_approval(state: &Value, checkout: &ICheckout) -> &'static str {
    let Some(approved) = state["approved"].as_array() else {
        return "ask";
    };
    if approved
        .iter()
        .find(|a| a["root"] == checkout.root)
        .is_some_and(|a| {
            repo_of(state, a["repoId"].as_str().unwrap_or_default())
                != repo_of(state, &checkout.repo_id)
        })
    {
        return "changed";
    }
    if approved.iter().any(|a| {
        a["root"] == checkout.root
            && a["gitDir"] == checkout.git_dir
            && a.get("identity").and_then(Value::as_str) == checkout.identity.as_deref()
            && repo_of(state, a["repoId"].as_str().unwrap_or_default())
                == repo_of(state, &checkout.repo_id)
    }) {
        "approved"
    } else {
        "ask"
    }
}

pub fn checkout_label(
    state: &Value,
    checkout: &ICheckout,
    files: &[String],
    home: &std::path::Path,
) -> String {
    let worktree = checkout.registered_worktree == Some(true)
        && state["approved"].as_array().is_some_and(|a| {
            a.iter()
                .any(|a| a["gitDir"] == checkout.git_dir && a["repoId"] == checkout.repo_id)
        });
    let path = crate::output::home_path(std::path::Path::new(&checkout.root), home);
    let found = if files.is_empty() {
        "files from the vault".to_owned()
    } else {
        files.join(", ")
    };
    if worktree {
        format!("{path}, worktree of {} ({found})", checkout.repo_id)
    } else {
        format!("{path} ({found})")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::empty_state;

    #[test]
    fn approval_binds_directory_remote_and_identity() {
        let mut state = empty_state("laptop");
        let checkout = ICheckout {
            root: "/code/main".into(),
            git_dir: "/code/main/.git".into(),
            repo_id: "example/repo".into(),
            ..Default::default()
        };
        assert_eq!(checkout_approval(&state, &checkout), "ask");
        state["approved"]
            .as_array_mut()
            .unwrap()
            .push(checkout_value(&checkout));
        assert_eq!(checkout_approval(&state, &checkout), "approved");
        let worktree = ICheckout {
            root: "/code/branch".into(),
            registered_worktree: Some(true),
            ..checkout.clone()
        };
        assert_eq!(checkout_approval(&state, &worktree), "ask");
        assert_eq!(
            checkout_label(&state, &worktree, &[".env".into()], Path::new("/code")),
            format!(
                "~{}branch, worktree of example/repo (.env)",
                std::path::MAIN_SEPARATOR
            )
        );
        assert_eq!(
            checkout_label(&state, &checkout, &[], Path::new("/code")),
            format!("~{}main (files from the vault)", std::path::MAIN_SEPARATOR)
        );
        let changed = ICheckout {
            repo_id: "host/other".into(),
            ..checkout.clone()
        };
        assert_eq!(checkout_approval(&state, &changed), "changed");
        state["aliases"]["host/other"] = checkout.repo_id.clone().into();
        assert_eq!(checkout_approval(&state, &changed), "approved");
        assert_eq!(
            checkout_approval(
                &state,
                &ICheckout {
                    identity: Some("new".into()),
                    ..checkout
                }
            ),
            "ask"
        );
    }

    use std::path::Path;
}
