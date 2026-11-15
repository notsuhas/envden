use super::commit::accept;
use crate::{
    admin::shared::{context::IAdminContext, history::current_history},
    client::{binary, text},
    state::files::{atomic_write, optional_read},
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub fn save(context: &IAdminContext<'_>, swap: &p::ISwap) -> Result<()> {
    atomic_write(
        &context.adapters.home.join("state/kit-replace"),
        text(&p::encode(swap)?).as_bytes(),
        (context.adapters.now)(),
    )
}

pub fn clear(context: &IAdminContext<'_>) -> Result<()> {
    match std::fs::remove_file(context.adapters.home.join("state/kit-replace")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(crate::state::files::failure(e)),
    }
}

pub fn settle(context: &IAdminContext<'_>) -> Result<bool> {
    let Some(saved) =
        optional_read(&context.adapters.home.join("state/kit-replace"))?.filter(|v| !v.is_empty())
    else {
        return Ok(false);
    };
    let swap: p::ISwap = p::decode(&binary(&saved)?)?;
    let history = current_history(context)?;
    let hash = p::object_hash(&swap.header, "manifest")?;
    let committed = history
        .headers
        .iter()
        .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == hash));
    if committed {
        accept(context, &swap, &history)?;
    }
    clear(context)?;
    Ok(committed)
}
