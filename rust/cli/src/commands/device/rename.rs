use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, sanitize_terminal},
    program::IInvocation,
    vault::admin::devices,
};
use envden_core::errors::Result;
use std::rc::Rc;
pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let name = &invocation.arguments[0];
    let renamed = devices::rename(adapters, name, Rc::new(UreqTransport))?;
    print(&if renamed {
        format!("This device is now {}", sanitize_terminal(name))
    } else {
        "This device already has that name".into()
    });
    Ok(())
}
