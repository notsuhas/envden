use super::{context::invalid, finish::TFinish};
use crate::{
    adapters::IAdapters,
    admin::{
        r#move::abort::remove,
        shared::{context::admin_context, transfer::optional_object},
    },
    client::{ITransport, binary, text},
    state::files::optional_read,
    vault::history::read_history,
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::rc::Rc;

pub fn resume_close(
    adapters: &IAdapters,
    token: &str,
    transport: Rc<dyn ITransport>,
) -> Result<Option<TFinish>> {
    let path = adapters.home.join("state/repair-close");
    let Some(saved) = optional_read(&path)? else {
        return Ok(None);
    };
    let swap: p::ISwap = p::decode(&binary(&saved)?)?;
    let id = p::h(
        "repair-id",
        &p::decode_token(p::TTokenKind::Repair, token)?.0,
    );
    let close = match swap.entries.first().map(|e| &e.body.change) {
        Some(p::TEntryPayload::RepairDone(v)) if v.repair_id == id => v,
        _ => {
            remove(&path)?;
            return Ok(None);
        }
    };
    let context = admin_context(adapters, transport)?;
    let history = match read_history(&context.client, &context.vault_id, None) {
        Err(e) if e.code == ErrorCode::RestoredMode => return Ok(None),
        other => other?,
    };
    let hash = p::object_hash(&swap.header, "manifest")?;
    if !history
        .headers
        .iter()
        .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == hash))
    {
        remove(&path)?;
        return Err(invalid(
            ErrorCode::Fork,
            "Repair close is not on the server chain",
        ));
    }
    crate::vault::admin::commit::accept(&context, &swap, &history)?;
    let envelope = optional_object(&context.client, "/v1/envelope")?;
    let restored = history
        .headers
        .iter()
        .position(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == close.restored_head))
        .ok_or_else(|| invalid(ErrorCode::InvalidData, "Missing restored checkpoint"))?;
    let after = history.headers[restored + 1..]
        .iter()
        .filter(|h| h.body.seq < swap.header.body.seq)
        .map(|h| h.body.clone())
        .collect::<Vec<_>>();
    let result = TFinish::Finished {
        report: optional_read(
            &adapters
                .home
                .join("state")
                .join(format!("repair-report-{}", text(&id))),
        )?,
        replace_kit: c::refuse_secret_key_proof(
            &after,
            envelope.is_some_and(|b| p::h("envelope-blob", &b) == swap.header.body.envelope_hash),
        ),
    };
    remove(&path)?;
    Ok(Some(result))
}
