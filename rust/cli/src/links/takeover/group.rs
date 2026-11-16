use super::super::file::IOwnLink;
use crate::output::home_path;
use crate::output::locale_compare;
use std::path::Path;

pub struct IOwnLinkGroup {
    pub target: String,
    pub links: Vec<IOwnLink>,
}

pub fn group_own_links(links: Vec<IOwnLink>) -> Vec<IOwnLinkGroup> {
    let mut groups: Vec<IOwnLinkGroup> = Vec::new();
    for link in links {
        if let Some(group) = groups.iter_mut().find(|group| group.target == link.target) {
            group.links.push(link);
        } else {
            groups.push(IOwnLinkGroup {
                target: link.target.clone(),
                links: vec![link],
            });
        }
    }
    groups.sort_by(|a, b| locale_compare(&a.target, &b.target));
    for group in &mut groups {
        group.links.sort_by(|a, b| {
            (a.checkout.registered_worktree == Some(true))
                .cmp(&(b.checkout.registered_worktree == Some(true)))
                .then_with(|| {
                    locale_compare(
                        &Path::new(&a.checkout.root).join(&a.path).to_string_lossy(),
                        &Path::new(&b.checkout.root).join(&b.path).to_string_lossy(),
                    )
                })
        });
    }
    groups
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
