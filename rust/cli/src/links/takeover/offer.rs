use super::super::file::IOwnLink;
use super::{
    adopt::adopt_group,
    group::{group_own_links, takeover_question},
    target::regular_target,
};
use crate::{adapters::IAdapters, output::prompts::consent};
use envden_core::errors::Result;
use envden_core::filesystem::ICanonicalPath;
use serde_json::Value;
use std::{
    io::{self, IsTerminal},
    path::Path,
};

type TAsk<'a> = &'a dyn Fn(&str) -> Result<bool>;

pub fn offer_takeover(
    adapters: &IAdapters,
    state: &mut Value,
    links: Vec<IOwnLink>,
    copy: bool,
    ask: Option<TAsk<'_>>,
) -> Result<Vec<IOwnLink>> {
    let home = adapters
        .user_home
        .canonical_path()
        .unwrap_or_else(|_| adapters.user_home.clone());
    let mut left = Vec::new();
    for group in group_own_links(links) {
        let approved = if regular_target(Path::new(&group.target)) {
            let question = takeover_question(&group, &home);
            match ask {
                Some(ask) => ask(&question)?,
                None => io::stdin().is_terminal() && consent(&question, true)?,
            }
        } else {
            false
        };
        if approved {
            left.extend(adopt_group(adapters, state, group, copy)?);
        } else {
            left.extend(group.links);
        }
    }
    Ok(left)
}
