use super::collisions::path_collisions;
use crate::{
    links::approval::repo_of,
    state::files::private_directory,
    sync::remote::{
        content::{entry_name, readable_entries},
        context::ISyncContext,
    },
};
use envden_core::errors::Result;
use std::collections::HashSet;

pub fn collision_entries(
    context: &ISyncContext<'_>,
    repos: &HashSet<String>,
) -> Result<HashSet<[u8; 32]>> {
    let store = context.adapters.home.join("store");
    private_directory(&store)?;
    let store_insensitive = context
        .adapters
        .repo
        .case_insensitive(&store.to_string_lossy(), false)?;
    let mut collisions = HashSet::new();
    for repo in repos {
        let mut insensitive = store_insensitive;
        for approved in context.state["approved"].as_array().into_iter().flatten() {
            if repo_of(
                &context.state,
                approved["repoId"].as_str().unwrap_or_default(),
            ) == repo
            {
                insensitive |= context
                    .adapters
                    .repo
                    .case_insensitive(approved["root"].as_str().unwrap_or_default(), false)?;
            }
        }
        let mut entries = Vec::new();
        let mut paths = Vec::new();
        for entry in readable_entries(context)? {
            let name = entry_name(context, &entry)?;
            if name.repo_id == *repo {
                entries.push(entry);
                paths.push(name.path);
            }
        }
        for index in path_collisions(&paths, insensitive) {
            collisions.insert(entries[index].file_id);
        }
    }
    Ok(collisions)
}
