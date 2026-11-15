use super::super::approval::{checkout_approval, repo_of};
use crate::{adapters::IAdapters, output::sanitize_terminal, settings::read_config};
use envden_core::{adapters::ICheckout, errors::Result};
use serde_json::Value;

pub fn worktree_approval(
    state: &Value,
    checkout: &ICheckout,
    clone: Option<&ICheckout>,
    enabled: bool,
) -> &'static str {
    let Some(clone) = clone else {
        return "ask";
    };
    if !enabled
        || checkout.registered_worktree != Some(true)
        || clone.registered_worktree == Some(true)
        || clone.root == checkout.root
        || clone.git_dir != checkout.git_dir
        || repo_of(state, &clone.repo_id) != repo_of(state, &checkout.repo_id)
        || state["approved"]
            .as_array()
            .is_some_and(|a| a.iter().any(|a| a["root"] == checkout.root))
    {
        return "ask";
    }
    if checkout_approval(state, clone) == "approved" {
        "approved"
    } else {
        "ask"
    }
}

pub fn auto_approved_worktree(
    adapters: &IAdapters,
    state: &Value,
    checkout: &ICheckout,
) -> Result<bool> {
    if checkout.registered_worktree != Some(true) || checkout_approval(state, checkout) != "ask" {
        return Ok(false);
    }
    let enabled = read_config(&adapters.home)?["auto-approve-worktrees"]
        .as_bool()
        .unwrap_or(false);
    let mut clone = None;
    if let Some(approved) = state["approved"].as_array() {
        for item in approved {
            if item["gitDir"] != checkout.git_dir || item["root"] == checkout.root {
                continue;
            }
            let candidate = adapters
                .repo
                .checkout_at(item["root"].as_str().unwrap_or_default())
                .ok()
                .flatten();
            if candidate
                .as_ref()
                .is_some_and(|c| c.registered_worktree != Some(true))
            {
                clone = candidate;
                break;
            }
        }
    }
    Ok(worktree_approval(state, checkout, clone.as_ref(), enabled) == "approved")
}

pub fn worktree_approved_notice(checkout: &ICheckout) -> String {
    sanitize_terminal(&format!(
        "Approved worktree {} (auto-approve-worktrees)",
        checkout.root
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{links::approval::checkout_value, state::empty_state};

    #[test]
    fn worktree_approval_matrix() {
        let clone = ICheckout {
            root: "/code/main".into(),
            git_dir: "/code/main/.git".into(),
            repo_id: "host/repo".into(),
            identity: Some("a".into()),
            ..Default::default()
        };
        let worktree = ICheckout {
            root: "/code/branch".into(),
            identity: Some("b".into()),
            registered_worktree: Some(true),
            ..clone.clone()
        };
        let mut state = empty_state("test");
        state["approved"]
            .as_array_mut()
            .unwrap()
            .push(checkout_value(&clone));
        assert_eq!(
            worktree_approval(&state, &worktree, Some(&clone), true),
            "approved"
        );
        assert_eq!(
            worktree_approval(&state, &worktree, Some(&clone), false),
            "ask"
        );
        assert_eq!(
            worktree_approval(&empty_state("test"), &worktree, Some(&clone), true),
            "ask"
        );
        assert_eq!(worktree_approval(&state, &worktree, None, true), "ask");
        assert_eq!(
            worktree_approval(
                &state,
                &worktree,
                Some(&ICheckout {
                    identity: Some("new".into()),
                    ..clone.clone()
                }),
                true
            ),
            "ask"
        );
        assert_eq!(
            worktree_approval(
                &state,
                &ICheckout {
                    registered_worktree: Some(false),
                    ..worktree.clone()
                },
                Some(&clone),
                true
            ),
            "ask"
        );
        assert_eq!(
            worktree_approval(
                &state,
                &ICheckout {
                    repo_id: "host/fork".into(),
                    ..worktree.clone()
                },
                Some(&clone),
                true
            ),
            "ask"
        );
        assert_eq!(worktree_approval(&state, &clone, Some(&clone), true), "ask");
        state["approved"]
            .as_array_mut()
            .unwrap()
            .push(checkout_value(&ICheckout {
                identity: Some("old".into()),
                ..worktree.clone()
            }));
        assert_eq!(
            worktree_approval(&state, &worktree, Some(&clone), true),
            "ask"
        );
    }
}
