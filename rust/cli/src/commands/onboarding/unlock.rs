use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, prompts::secret},
    session::{TPassword, unlock_device},
};
use envden_core::errors::Result;
use std::rc::Rc;

pub fn run_unlock(adapters: &IAdapters) -> Result<()> {
    let mut prompt = |retry| {
        secret(
            if retry {
                "Wrong master password. Try again"
            } else {
                "Master password"
            },
            |_| None,
        )
    };
    unlock_device(
        adapters,
        TPassword::Prompt(&mut prompt),
        Rc::new(UreqTransport),
    )?;
    print("Unlocked");
    Ok(())
}
