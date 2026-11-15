use crate::{adapters::IAdapters, program::IInvocation};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::io::{self, IsTerminal};

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let options = serde_json::to_value(&invocation.options).expect("options");
    let missing = super::missing_setup_flags(io::stdin().is_terminal(), &options);
    if !missing.is_empty() {
        eprintln!(
            "Missing choices: {}. Or run setup in your own terminal.",
            missing.join(", ")
        );
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Setup choices require your own terminal",
        ));
    }
    let state = crate::onboarding::run_setup(adapters, &options)?;
    for line in super::summary::summary(&state, &adapters.user_home, true) {
        println!("{line}");
    }
    Ok(())
}
