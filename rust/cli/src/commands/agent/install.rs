use crate::{adapters::IAdapters, agent::install::install_agent, output::print};
use envden_core::errors::Result;

pub fn install(adapters: &IAdapters) -> Result<()> {
    install_agent(&adapters.user_home, (adapters.now)())?;
    print("Agent skill installed");
    Ok(())
}
