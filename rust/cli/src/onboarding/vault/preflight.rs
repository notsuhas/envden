use envden_core::errors::Result;

pub(super) fn preflight(hosted: bool, check: impl FnOnce() -> Result<()>) -> Result<()> {
    if hosted {
        return Ok(());
    }

    check()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosted_setup_defers_server_check_until_after_prompts() {
        preflight(true, || panic!("hosted setup must prompt before hello")).unwrap();
        assert!(
            preflight(false, || Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::Unauthorized,
                "test"
            )))
            .is_err()
        );
    }
}
