pub(super) struct IFacts {
    pub oversized: bool,
    pub approval: bool,
    pub included: bool,
    pub conflict: bool,
    pub pending: bool,
    pub unapplied: bool,
    pub lost: bool,
}

pub(super) fn reason_for(input: IFacts) -> Option<&'static str> {
    if input.oversized {
        return Some("oversized");
    }
    if !input.approval {
        return Some("needs-approval");
    }
    if !input.included {
        return Some("excluded");
    }
    if input.conflict {
        return Some("conflict");
    }
    if input.lost {
        return Some("lost");
    }
    if input.pending || input.unapplied {
        return Some("incomplete");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn held_back_priority_matches_reference() {
        for (flags, expected) in [
            (
                [true, false, false, true, true, true, true],
                Some("oversized"),
            ),
            (
                [false, false, false, true, true, true, true],
                Some("needs-approval"),
            ),
            (
                [false, true, false, true, true, true, true],
                Some("excluded"),
            ),
            (
                [false, true, true, true, true, true, true],
                Some("conflict"),
            ),
            ([false, true, true, false, true, true, true], Some("lost")),
            (
                [false, true, true, false, true, false, false],
                Some("incomplete"),
            ),
            (
                [false, true, true, false, false, true, false],
                Some("incomplete"),
            ),
            ([false, true, true, false, false, false, false], None),
        ] {
            let [
                oversized,
                approval,
                included,
                conflict,
                pending,
                unapplied,
                lost,
            ] = flags;
            assert_eq!(
                reason_for(IFacts {
                    oversized,
                    approval,
                    included,
                    conflict,
                    pending,
                    unapplied,
                    lost
                }),
                expected
            );
        }
    }
}
