use crate::links::{approval::repo_of, takeover::sibling::normalize};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol::validate_path;
use serde_json::Value;
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

#[derive(Debug, PartialEq, Eq)]
pub struct IHistoryTarget {
    pub root: String,
    pub path: String,
    pub repo_id: String,
    pub link: Option<Value>,
}

pub fn history_targets(
    state: &Value,
    repos: &HashSet<String>,
    cwd: &Path,
    file: Option<&str>,
    all: bool,
) -> Result<Vec<IHistoryTarget>> {
    let approved: Vec<_> = state["approved"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| Some((a["root"].as_str()?, repo_of(state, a["repoId"].as_str()?))))
        .filter(|(_, repo)| repos.contains(*repo))
        .collect();
    if let Some(file) = file {
        let absolute = normalize(&cwd.join(file));
        let (root, repo) = deepest(&approved, &absolute).ok_or_else(|| {
            EnvdenError::new(ErrorCode::NotFound, "File is not in an approved checkout")
        })?;
        let path = absolute
            .strip_prefix(root)
            .unwrap_or(Path::new(""))
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");
        validate_path(&path).map_err(|e| {
            EnvdenError::with_source(
                ErrorCode::InvalidInput,
                "Name an env file inside the checkout",
                e,
            )
        })?;
        let link = state["links"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|l| l["root"] == root && l["path"] == path)
            .cloned();
        return Ok(vec![IHistoryTarget {
            root: root.into(),
            path,
            repo_id: repo.into(),
            link,
        }]);
    }
    let roots = if all {
        approved.clone()
    } else {
        deepest(&approved, cwd).into_iter().collect()
    };
    let mut targets = Vec::new();
    for (root, repo) in roots {
        for link in state["links"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|l| l["root"] == root && l["localOnly"] != true)
        {
            targets.push(IHistoryTarget {
                root: root.into(),
                path: link["path"].as_str().unwrap_or_default().into(),
                repo_id: repo.into(),
                link: Some(link.clone()),
            });
        }
    }
    Ok(targets)
}

pub fn selection_directory(cwd: &Path, file: Option<&str>) -> PathBuf {
    file.map_or_else(
        || cwd.to_owned(),
        |file| {
            normalize(&cwd.join(file))
                .parent()
                .unwrap_or(Path::new("/"))
                .to_owned()
        },
    )
}

fn deepest<'a>(checkouts: &[(&'a str, &'a str)], path: &Path) -> Option<(&'a str, &'a str)> {
    checkouts
        .iter()
        .filter(|(root, _)| path.starts_with(root))
        .max_by_key(|(root, _)| root.len())
        .copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn checkout_selection_named_files_and_aliases() {
        let state = json!({"approved":[{"root":"/work/app","repoId":"example/app"},{"root":"/work/app-feature","repoId":"example/app"},{"root":"/work/other","repoId":"example/fork"}],"aliases":{"example/fork":"example/app"},"links":[{"root":"/work/app","path":".env"},{"root":"/work/app","path":"api/.env.local"},{"root":"/work/app-feature","path":".env"},{"root":"/work/app","path":".env.test","localOnly":true}]});
        let repos = HashSet::from(["example/app".into()]);
        let cwd = Path::new("/work/app/api");
        let selected = history_targets(&state, &repos, cwd, None, false).unwrap();
        assert_eq!(
            selected.iter().map(|t| t.path.as_str()).collect::<Vec<_>>(),
            [".env", "api/.env.local"]
        );
        assert_eq!(
            history_targets(&state, &repos, Path::new("/"), None, true)
                .unwrap()
                .len(),
            3
        );
        let named = history_targets(
            &state,
            &repos,
            Path::new("/work/app-feature"),
            Some("../app/.env.test"),
            false,
        )
        .unwrap();
        assert_eq!(named[0].link, Some(state["links"][3].clone()));
        let gone = history_targets(
            &state,
            &repos,
            Path::new("/work/other"),
            Some(".env.gone"),
            false,
        )
        .unwrap();
        assert_eq!(gone[0].repo_id, "example/app");
        assert!(gone[0].link.is_none());
        assert_eq!(
            selection_directory(Path::new("/"), Some("/work/app/api/.env")),
            Path::new("/work/app/api")
        );
        for (file, code) in [
            ("/elsewhere/.env", ErrorCode::NotFound),
            ("/work/app", ErrorCode::InvalidInput),
        ] {
            assert_eq!(
                history_targets(&state, &repos, cwd, Some(file), false)
                    .unwrap_err()
                    .code,
                code
            );
        }
    }
}
