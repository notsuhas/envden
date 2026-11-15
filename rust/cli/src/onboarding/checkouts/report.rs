use crate::{
    links::{discovery::repos::IRepoSkip, file::IOwnLink},
    output::{home_path, sanitize_terminal},
};
use std::path::Path;

pub(in crate::onboarding) fn report_repo_skips(
    skips: &[IRepoSkip],
    home: &Path,
    verbose: bool,
    command: &str,
) {
    if verbose {
        for skip in skips {
            eprintln!(
                "{}",
                sanitize_terminal(&format!(
                    "{}: skipped: {}",
                    home_path(Path::new(&skip.path), home),
                    skip.reason
                ))
            );
        }
        return;
    }
    let remote = skips.iter().filter(|s| s.kind == "remote").count();
    let identity = skips.iter().filter(|s| s.kind == "identity").count();
    summary(remote, identity, 0, command);
}

pub(in crate::onboarding) fn report_own_links(
    links: &[IOwnLink],
    home: &Path,
    verbose: bool,
    command: &str,
) {
    if verbose {
        for link in links {
            eprintln!(
                "envden: skipped {}: it links to {}, and envden only syncs files it owns",
                sanitize_terminal(&home_path(
                    &Path::new(&link.checkout.root).join(&link.path),
                    home
                )),
                sanitize_terminal(&link.link)
            );
        }
        return;
    }
    summary(0, 0, links.len(), command);
}

fn summary(remote: usize, identity: usize, own: usize, command: &str) {
    let mut parts = vec![];
    for (count, one, many) in [
        (
            remote,
            "repo without a usable git remote",
            "repos without a usable git remote",
        ),
        (
            identity,
            "repo envden couldn't identify",
            "repos envden couldn't identify",
        ),
        (
            own,
            "env file that is your own symlink",
            "env files that are your own symlinks",
        ),
    ] {
        if count > 0 {
            parts.push(format!("{count} {}", if count == 1 { one } else { many }));
        }
    }
    let Some(last) = parts.pop() else {
        return;
    };
    let list = if parts.is_empty() {
        last
    } else {
        format!("{} and {last}", parts.join(", "))
    };
    eprintln!(
        "Skipped {list}. Run {command} --verbose to list {}.",
        if remote + identity + own == 1 {
            "it"
        } else {
            "them"
        }
    );
}
