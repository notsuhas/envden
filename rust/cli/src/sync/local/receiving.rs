use crate::links::approval::repo_of;
use envden_protocol::protocol::IFileName;
use serde_json::Value;

pub fn receives_file(state: &Value, name: &IFileName) -> bool {
    state["approved"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|checkout| {
            repo_of(state, checkout["repoId"].as_str().unwrap_or_default()) == name.repo_id
                && !state["links"].as_array().into_iter().flatten().any(|link| {
                    link["root"] == checkout["root"]
                        && link["path"] == name.path
                        && link["localOnly"] == true
                })
        })
}
