use crate::{
    adapters::IAdapters, client::UreqTransport, commands::vault::output::replacement_output,
    output::print, program::IInvocation, vault::admin::removal,
};
use envden_core::errors::Result;
use serde_json::Value;
use std::rc::Rc;
pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let mut output = replacement_output(
        adapters,
        invocation.options.get("kitOut").and_then(Value::as_str),
    );
    let finished = removal::remove(
        adapters,
        &invocation.arguments[0],
        invocation.options.get("newKit") == Some(&Value::Bool(true)),
        Rc::new(UreqTransport),
        &mut |kit| output.show(kit),
    )
    .inspect_err(|_| output.fail())?;
    print(if finished {
        "Finished an interrupted removal; the recovery kit it showed is now active"
    } else {
        "Device removed"
    });
    Ok(())
}
