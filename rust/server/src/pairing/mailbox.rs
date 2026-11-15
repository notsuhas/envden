use super::lookup::{index, lookup};
use crate::{
    http::{
        encoding::{binary, input, text},
        types::IAppOptions,
    },
    middleware::{IAuth, require_gate},
};
use envden_core::{
    adapters::storage::{IStateWrite, TMailboxSlot, TMailboxWrite, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::{IMailboxWrite, opaque_message};
use serde_json::{Value, json};

pub(crate) fn pairing(
    options: &IAppOptions,
    auth: &IAuth,
    path: &str,
    method: &str,
    body: &[u8],
) -> Result<Option<Value>> {
    let storage = options.storage.as_ref();
    let request = &auth.request;
    let id = &request.vault_id;
    if path == "/v1/pairing/mailboxes" {
        require_gate(options, auth, true)?;
        let mut result = None;
        storage.transaction(&mut || {
            let mailbox = storage
                .open_mailbox(id, &request.device, (options.now)())?
                .ok_or_else(|| EnvdenError::new(ErrorCode::RateLimited, "Mailbox limit reached"))?;
            storage.write_state(
                id,
                &[IStateWrite {
                    kind: TStateKind::MailboxJoiner,
                    key: vec![(mailbox.number >> 8) as u8, mailbox.number as u8],
                    bytes: None,
                }],
            )?;
            index(storage, &format!("mailbox/{}", mailbox.number), id)?;
            result = Some(json!({"number":mailbox.number,"expiresAt":mailbox.expires_at}));
            Ok(())
        })?;
        return Ok(result);
    }
    if path == "/v1/pairing/approver" {
        let bytes = super::approver::fetch(options, auth)?;
        return Ok(Some(json!({"message":text(&bytes)})));
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.get(3) != Some(&"mailboxes") {
        return Ok(None);
    }
    let number: u64 = parts
        .get(4)
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidInput, "Invalid mailbox number"))?;
    let vault = lookup(storage, id, &format!("mailbox/{number}"))?;
    let mailbox = storage
        .mailbox(&vault, number, (options.now)())?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Mailbox closed"))?;
    let owner = mailbox.device == request.device;
    if method == "DELETE" {
        if !owner {
            return Err(EnvdenError::new(
                ErrorCode::Unauthorized,
                "Wrong mailbox owner",
            ));
        }
        storage.close_mailbox(id, number)?;
        return Ok(Some(json!({"kind":"closed"})));
    }
    let slot = super::access::slot(parts.get(5).copied().unwrap_or(""))?;
    let write = method == "PUT";
    let super::access::IAccess {
        mailbox,
        vault,
        binding,
        bound,
    } = super::access::accessible(options, auth, number, slot, write)?;
    if !write {
        return Ok(Some(match mailbox.slots.get(&slot) {
            Some(bytes) => json!({"message":text(bytes),"expiresAt":mailbox.expires_at}),
            None => json!({"kind":"pending","expiresAt":mailbox.expires_at}),
        }));
    }
    let message: IMailboxWrite = serde_json::from_slice(body)
        .map_err(|_| EnvdenError::new(ErrorCode::InvalidInput, "Invalid input"))?;
    let bytes = binary(&message.message, None)?;
    if mailbox
        .slots
        .get(&slot)
        .is_some_and(|prior| *prior != bytes)
    {
        storage.close_mailbox(&vault, number)?;
        return Err(EnvdenError::new(ErrorCode::Conflict, "Mailbox closed"));
    }
    let length = match slot {
        TMailboxSlot::KE1 => Some(96),
        TMailboxSlot::KE2 => Some(320),
        TMailboxSlot::KE3 => Some(64),
        _ => None,
    };
    if let Some(length) = length {
        input(|| opaque_message(&message.message, length))?;
    }
    let result = storage.write_mailbox(&vault, number, slot, &bytes, (options.now)())?;
    let kind = match result {
        TMailboxWrite::Written => "written",
        TMailboxWrite::Identical => "identical",
        _ => return Err(EnvdenError::new(ErrorCode::Conflict, "Mailbox closed")),
    };
    if slot == TMailboxSlot::KE1
        && (bound.is_none() || !mailbox.slots.contains_key(&TMailboxSlot::KE1))
    {
        storage.write_state(
            &vault,
            &[IStateWrite {
                kind: TStateKind::MailboxJoiner,
                key: binding,
                bytes: Some(request.device.to_vec()),
            }],
        )?;
    }
    if slot == TMailboxSlot::PairJoiner {
        index(
            storage,
            &format!("approver/{}", text(&request.device)),
            &vault,
        )?;
    }

    Ok(Some(json!({"kind":kind,"expiresAt":mailbox.expires_at})))
}
