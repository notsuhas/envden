use serde_json::Value;

pub fn checkout_repo<'a>(state: &'a Value, root: &str) -> Option<&'a str> {
    let checkout = state["approved"]
        .as_array()?
        .iter()
        .find(|a| a["root"] == root)?;
    Some(super::super::approval::repo_of(
        state,
        checkout["repoId"].as_str()?,
    ))
}
