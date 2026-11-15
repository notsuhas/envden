pub fn sync_text(direction: &str, changed: u64, conflicts: u64) -> String {
    let verb = if direction == "push" {
        "Pushed"
    } else {
        "Pulled"
    };
    let moved = (changed != 0).then(|| format!("{verb} {}", plural(changed, "file")));
    if conflicts == 0 {
        return moved.unwrap_or_else(|| {
            if direction == "push" {
                "Nothing to push"
            } else {
                "Up to date"
            }
            .into()
        });
    }
    let pending = format!("{} to resolve", plural(conflicts, "conflict"));
    moved.map_or_else(
        || format!("{pending}; nothing {}", verb.to_lowercase()),
        |m| format!("{m}; {pending}"),
    )
}

fn plural(count: u64, noun: &str) -> String {
    format!("{count} {noun}{}", if count == 1 { "" } else { "s" })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn summaries() {
        for (direction, changed, conflicts, expected) in [
            ("push", 0, 0, "Nothing to push"),
            ("pull", 0, 0, "Up to date"),
            ("push", 1, 0, "Pushed 1 file"),
            ("pull", 2, 1, "Pulled 2 files; 1 conflict to resolve"),
            ("push", 0, 2, "2 conflicts to resolve; nothing pushed"),
        ] {
            assert_eq!(sync_text(direction, changed, conflicts), expected);
        }
    }
}
