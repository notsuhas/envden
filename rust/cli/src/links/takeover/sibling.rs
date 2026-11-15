use super::super::file::IOwnLink;
use std::path::{Component, Path, PathBuf};

pub fn sibling_link(own: &IOwnLink, env_files: &[String]) -> bool {
    let destination = Path::new(&own.checkout.root).join(&own.path);
    let target = normalize(
        &destination
            .parent()
            .unwrap_or(Path::new("/"))
            .join(&own.link),
    );
    target
        .strip_prefix(&own.checkout.root)
        .is_ok_and(|rel| env_files.iter().any(|p| Path::new(p) == rel))
}

pub fn normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}
