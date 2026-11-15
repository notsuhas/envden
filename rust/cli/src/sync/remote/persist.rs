use super::context::ISyncContext;
use crate::{
    client::text, identity::adopt_committed_name, state::repository::save_state,
    vault::join::encode_verified_state,
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub fn persist_checkpoint(context: &mut ISyncContext<'_>) -> Result<()> {
    context.state["checkpoint"] =
        text(&p::object_hash(&context.checkpoint.header, "manifest")?).into();
    context.state["verifiedState"] =
        encode_verified_state(&context.checkpoint.state, &context.entries)?;
    if let Some(own) = context
        .checkpoint
        .state
        .devices
        .get(&context.identity.record.id)
        .filter(|own| context.state["deviceName"] != own.name)
    {
        adopt_committed_name(&*context.adapters.keychain, &context.adapters.home, own)?;
        context.state["deviceName"] = own.name.clone().into();
    }
    context.state["files"] = text(&p::encode(&context.checkpoint.files)?).into();
    context.state["headers"] = context
        .headers
        .iter()
        .map(|h| p::encode(h).map(|b| serde_json::Value::String(text(&b))))
        .collect::<Result<Vec<_>>>()?
        .into();
    context.state["entries"] = context
        .entries
        .iter()
        .map(|e| p::encode(e).map(|b| serde_json::Value::String(text(&b))))
        .collect::<Result<Vec<_>>>()?
        .into();
    save_state(
        &context.adapters.home,
        &context.state,
        (context.options.now)(),
    )
}
