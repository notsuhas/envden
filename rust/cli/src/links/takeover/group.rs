use super::super::file::IOwnLink;
use crate::output::home_path;
use std::{collections::BTreeMap, path::Path};

pub struct IOwnLinkGroup {
    pub target: String,
    pub links: Vec<IOwnLink>,
}

pub fn group_own_links(links: Vec<IOwnLink>) -> Vec<IOwnLinkGroup> {
    let mut groups: BTreeMap<String, Vec<IOwnLink>> = BTreeMap::new();
    for link in links {
        groups.entry(link.target.clone()).or_default().push(link);
    }
    groups
        .into_iter()
        .map(|(target, mut links)| {
            links.sort_by_key(|l| {
                (
                    l.checkout.registered_worktree == Some(true),
                    Path::new(&l.checkout.root).join(&l.path),
                )
            });
            IOwnLinkGroup { target, links }
        })
        .collect()
}

pub fn takeover_question(group: &IOwnLinkGroup, home: &Path) -> String {
    let paths: Vec<_> = group
        .links
        .iter()
        .map(|l| home_path(&Path::new(&l.checkout.root).join(&l.path), home))
        .collect();
    let Some(first) = paths.first() else {
        return String::new();
    };
    let others = paths.len() - 1;
    let who = if others > 0 {
        format!(
            "{first} and {others} {} link",
            if others == 1 { "other" } else { "others" }
        )
    } else {
        format!("{first} links")
    };
    let (subject, object) = if others > 0 {
        ("Each checkout", "them")
    } else {
        ("The checkout", "it")
    };
    format!(
        "{who} to {}. Let envden manage it? {subject} will use envden's synced copy instead of that file, and later edits to the file won't reach {object}.",
        home_path(Path::new(&group.target), home)
    )
}
