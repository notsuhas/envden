use envden_core::merge::{IEnvDiff, diff_env_keys};

#[derive(Debug, PartialEq, Eq)]
pub enum TKeyChanges {
    Keys(IEnvDiff),
    Unparsed,
    Unknown,
}

pub fn version_kind(state: u8) -> &'static str {
    match state {
        2 => "deleted",
        3 => "restored",
        4 => "lost",
        _ => "live",
    }
}

pub fn version_changes(versions: &[Option<&[u8]>], complete: bool) -> Vec<TKeyChanges> {
    versions
        .iter()
        .enumerate()
        .map(|(i, version)| {
            if i + 1 == versions.len() && !complete {
                return TKeyChanges::Unknown;
            }
            let previous = versions.get(i + 1).copied().flatten().unwrap_or_default();
            match diff_env_keys(previous, version.unwrap_or_default()) {
                Ok(diff) => TKeyChanges::Keys(diff),
                Err(_) => TKeyChanges::Unparsed,
            }
        })
        .collect()
}

pub fn changes_text(changes: &TKeyChanges) -> String {
    let changes = match changes {
        TKeyChanges::Unknown => return "changes unknown".into(),
        TKeyChanges::Unparsed => return "changed (file not parsable)".into(),
        TKeyChanges::Keys(changes) => changes,
    };
    let mut parts = Vec::new();
    for (label, keys) in [
        ("added", &changes.added),
        ("changed", &changes.changed),
        ("removed", &changes.removed),
    ] {
        if !keys.is_empty() {
            parts.push(format!("{label} {}", keys.join(", ")));
        }
    }
    if parts.is_empty() {
        "no key changes".into()
    } else {
        parts.join("; ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn changes_compare_newest_to_next_older() {
        let one = Some(b"A=1\nB=2\n".as_slice());
        let two = Some(b"A=1\nB=3\nC=4\n".as_slice());
        let three = Some(b"B=3\nC=4\n".as_slice());
        let text = |versions: &[Option<&[u8]>], complete| {
            version_changes(versions, complete)
                .iter()
                .map(changes_text)
                .collect::<Vec<_>>()
        };
        assert_eq!(text(&[one], true), ["added A, B"]);
        assert_eq!(text(&[one], false), ["changes unknown"]);
        assert_eq!(
            text(&[three, two, one], true),
            ["removed A", "added C; changed B", "added A, B"]
        );
        assert_eq!(
            text(&[one, None, one], true),
            ["added A, B", "removed A, B", "added A, B"]
        );
        assert_eq!(
            text(&[Some(b"A=\"unterminated\n"), one], false),
            ["changed (file not parsable)", "changes unknown"]
        );
        assert_eq!(
            (1..=4).map(version_kind).collect::<Vec<_>>(),
            ["live", "deleted", "restored", "lost"]
        );
    }
}
