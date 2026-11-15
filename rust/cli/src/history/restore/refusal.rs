use envden_core::errors::{EnvdenError, ErrorCode};

pub fn restore_refusal(
    managed: bool,
    local_only: bool,
    detached: bool,
    conflicted: bool,
) -> Option<EnvdenError> {
    let (code, message) = if !managed {
        (ErrorCode::NotFound, "File is not managed by envden")
    } else if local_only {
        (
            ErrorCode::InvalidInput,
            "Local-only files are not restored from history",
        )
    } else if detached {
        (
            ErrorCode::Conflict,
            "File is detached; reconcile it with envden pull before restoring",
        )
    } else if conflicted {
        (
            ErrorCode::Conflict,
            "File has a conflict; run envden resolve first",
        )
    } else {
        return None;
    };
    Some(EnvdenError::new(code, message))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn priority_matches_the_reference() {
        for (managed, local, detached, conflict, message) in [
            (false, true, true, true, "File is not managed by envden"),
            (
                true,
                true,
                true,
                true,
                "Local-only files are not restored from history",
            ),
            (
                true,
                false,
                true,
                true,
                "File is detached; reconcile it with envden pull before restoring",
            ),
            (
                true,
                false,
                false,
                true,
                "File has a conflict; run envden resolve first",
            ),
        ] {
            assert_eq!(
                restore_refusal(managed, local, detached, conflict)
                    .unwrap()
                    .message,
                message
            );
        }
        assert!(restore_refusal(true, false, false, false).is_none());
    }
}
