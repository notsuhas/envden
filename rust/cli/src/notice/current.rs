use serde_json::Value;

pub(super) fn current_repo_id<'a>(state: &'a Value, cwd: Option<&str>) -> Option<&'a str> {
    let absolute = std::path::absolute(cwd?).ok()?;
    let mut resolved = std::path::PathBuf::new();
    for component in absolute.components() {
        if component == std::path::Component::ParentDir {
            resolved.pop();
        } else {
            resolved.push(component);
        }
    }
    let cwd = resolved.to_str()?;
    let current = state["approved"].as_array()?.iter().find(|checkout| {
        checkout["root"].as_str().is_some_and(|root| {
            cwd == root || cwd.starts_with(&format!("{root}{}", std::path::MAIN_SEPARATOR))
        })
    })?;
    let repo = current["repoId"].as_str()?;

    Some(state["aliases"][repo].as_str().unwrap_or(repo))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn resolves_cwd_before_matching_approved_checkouts() {
        let parent = std::env::current_dir().unwrap();
        let root = parent.join("approved");
        let state =
            json!({"approved":[{"root":root,"repoId":"fork"}],"aliases":{"fork":"canonical"}});
        for (cwd, expected) in [
            (root.join("child/.."), Some("canonical")),
            (root.join("../other"), None),
            (parent.join("approved-other"), None),
        ] {
            assert_eq!(current_repo_id(&state, cwd.to_str()), expected);
        }
        let root = std::env::current_dir().unwrap();
        let state = json!({"approved":[{"root":root,"repoId":"repo"}],"aliases":{}});
        assert_eq!(current_repo_id(&state, Some(".")), Some("repo"));
        assert_eq!(current_repo_id(&state, None), None);
    }
}
