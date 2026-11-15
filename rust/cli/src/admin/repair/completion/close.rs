use super::super::{context::invalid, login::repair_login};
use crate::{
    adapters::IAdapters,
    admin::shared::{context::IAdminContext, swap::admin_swap},
    client::{binary, text},
    state::files::{atomic_write, optional_read},
    vault::history::IVaultHistory,
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};

pub fn close(
    adapters: &IAdapters,
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    status: &p::IRepairStatus,
    id: &[u8; 32],
    password: &str,
) -> Result<()> {
    let restored_head = p::fixed(&binary(&status.restored_head)?)?;
    let index = history
        .headers
        .iter()
        .position(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == restored_head))
        .ok_or_else(|| invalid(ErrorCode::InvalidData, "Restored head is not on the chain"))?;
    let evidence = optional_read(
        &adapters
            .home
            .join("state")
            .join(format!("repair-restored-{}", text(id))),
    )?;
    let observed = history
        .headers
        .iter()
        .position(|h| p::object_hash(h, "manifest").is_ok_and(|v| Some(text(&v)) == evidence));
    if observed.is_none_or(|v| v < index) {
        return Err(invalid(
            ErrorCode::InvalidData,
            "Restored head exceeds the observed restore point",
        ));
    }
    let after = history.headers[index + 1..]
        .iter()
        .map(|h| h.body.clone())
        .collect::<Vec<_>>();
    let mut finish = repair_login(
        &context.client,
        &context.vault_id,
        password,
        c::repair_login_decision(&after),
    )?;
    let entry = crate::vault::admin::commit::entry(
        context,
        history,
        p::TEntryPayload::RepairDone(p::IRepairDone {
            repair_id: *id,
            restored_head,
        }),
    )?;
    let mut swap = admin_swap(
        history,
        &context.identity,
        12,
        (adapters.now)(),
        vec![entry],
    )?;
    if finish["kind"] == "registration" {
        swap.opaque_record = Some(binary(finish["message"].as_str().expect("message"))?);
    }
    let encoded = text(&p::encode(&swap)?);
    atomic_write(
        &adapters.home.join("state/repair-close"),
        encoded.as_bytes(),
        (adapters.now)(),
    )?;
    finish["swap"] = encoded.into();
    context
        .client
        .request("/v1/repair/finish", "POST", Some(&finish))?;
    Ok(())
}
