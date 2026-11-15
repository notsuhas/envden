use envden_core::adapters::TPlacementState;

#[derive(Default)]
pub struct IFileFacts {
    pub local_only: bool,
    pub conflict: bool,
    pub placement: Option<TPlacementState>,
    pub held_back: bool,
    pub changed: bool,
    pub remote: bool,
}

pub fn derive_file_state(facts: &IFileFacts) -> &'static str {
    if facts.local_only {
        return "local-only";
    }
    if facts.conflict {
        return "conflict";
    }
    if facts.placement == Some(TPlacementState::Detached) {
        return "detached";
    }
    if facts.held_back {
        return "held-back";
    }
    if facts.placement == Some(TPlacementState::Missing) {
        return if facts.remote { "remote" } else { "missing" };
    }
    if facts.changed && facts.remote {
        return "diverged";
    }
    if facts.changed {
        return "changed";
    }
    if facts.remote { "remote" } else { "in-sync" }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn states_and_precedence() {
        let rows = [
            (IFileFacts::default(), "in-sync"),
            (
                IFileFacts {
                    placement: Some(TPlacementState::Relinkable),
                    ..Default::default()
                },
                "in-sync",
            ),
            (
                IFileFacts {
                    changed: true,
                    ..Default::default()
                },
                "changed",
            ),
            (
                IFileFacts {
                    remote: true,
                    ..Default::default()
                },
                "remote",
            ),
            (
                IFileFacts {
                    changed: true,
                    remote: true,
                    ..Default::default()
                },
                "diverged",
            ),
            (
                IFileFacts {
                    placement: Some(TPlacementState::Missing),
                    ..Default::default()
                },
                "missing",
            ),
            (
                IFileFacts {
                    placement: Some(TPlacementState::Missing),
                    remote: true,
                    ..Default::default()
                },
                "remote",
            ),
            (
                IFileFacts {
                    held_back: true,
                    changed: true,
                    ..Default::default()
                },
                "held-back",
            ),
            (
                IFileFacts {
                    placement: Some(TPlacementState::Detached),
                    held_back: true,
                    ..Default::default()
                },
                "detached",
            ),
            (
                IFileFacts {
                    conflict: true,
                    held_back: true,
                    changed: true,
                    ..Default::default()
                },
                "conflict",
            ),
            (
                IFileFacts {
                    local_only: true,
                    conflict: true,
                    ..Default::default()
                },
                "local-only",
            ),
        ];
        for (facts, expected) in rows {
            assert_eq!(derive_file_state(&facts), expected);
        }
    }
}
