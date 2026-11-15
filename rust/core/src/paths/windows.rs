use super::TRootPlacement;
fn normalized(path: &str) -> String {
    let input = path.replace('\\', "/").to_lowercase();
    let mut parts = Vec::new();
    for part in input.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.len() > 1 {
                    parts.pop();
                }
            }
            _ => parts.push(part),
        }
    }
    parts.join("/")
}
pub fn place_in_root_windows(root: &str, target: &str) -> TRootPlacement {
    let root = normalized(root);
    let target = normalized(target);
    if root == target {
        TRootPlacement::Root
    } else if target
        .strip_prefix(&root)
        .is_some_and(|s| s.starts_with('/'))
    {
        TRootPlacement::Inside
    } else {
        TRootPlacement::Outside
    }
}
