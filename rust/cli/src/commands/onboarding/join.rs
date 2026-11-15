use crate::{adapters::IAdapters, program::IInvocation};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let address = crate::onboarding::require_server_address(&invocation.arguments[0])?;
    let options = serde_json::to_value(&invocation.options).expect("options");
    let state = crate::onboarding::run_join(adapters, &address, &options)?;
    for line in super::summary::summary(&state, &adapters.user_home, false) {
        println!("{line}");
    }
    Ok(())
}
