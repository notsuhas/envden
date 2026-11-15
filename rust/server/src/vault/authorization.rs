use crate::{
    auth::{has_proof, require_ticket, session_key},
    http::types::IAppOptions,
    middleware::{IAuth, require_gate},
};
use envden_core::{
    adapters::storage::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::{chain::TAuthorization, protocol::*};

pub(super) fn authorize(
    options: &IAppOptions,
    auth: &IAuth,
    swap: &ISwap,
    required: TAuthorization,
    stored: &mut IStoredSwap,
    mailbox: Option<u64>,
) -> Result<()> {
    let id = &auth.request.vault_id;
    let storage = options.storage.as_ref();
    let unauthorized = || EnvdenError::new(ErrorCode::Unauthorized, "Operation authority required");
    match required {
        TAuthorization::Unlocked => require_gate(options, auth, false)?,
        TAuthorization::Fresh => require_gate(options, auth, true)?,
        TAuthorization::FreshOrRepairToken | TAuthorization::RepairToken => {
            if storage.vault(id)?.is_some_and(|v| v.restored.is_some()) {
                if !has_proof(options, auth, "repair")? {
                    return Err(unauthorized());
                }
            } else {
                require_gate(options, auth, true)?;
            }
        }
        TAuthorization::SkProof => {
            if !auth.member || !has_proof(options, auth, "sk")? {
                return Err(unauthorized());
            }
        }
        TAuthorization::JoinTicket => {
            require_ticket(options, auth)?;
            let Some(TEntryPayload::AddDevice(add)) = swap.entries.first().map(|e| &e.body.change)
            else {
                return Err(unauthorized());
            };
            if add.device.id != auth.request.device {
                return Err(unauthorized());
            }
            let mut key = session_key(auth, "kit");
            key.kind = TSessionKind::JoinTicket;
            stored.consume_sessions = Some(vec![key]);
            let period = storage
                .vault(id)?
                .and_then(|v| v.unlock_period)
                .unwrap_or(2592000000);
            stored.devices = Some(vec![IDeviceWrite {
                id: auth.request.device.to_vec(),
                state: IStoredDevice {
                    unlocked_until: (options.now)() + period,
                    fresh_until: 0,
                    client_version: auth.request.client_version.clone(),
                    mailbox_grant: None,
                },
            }]);
        }
        TAuthorization::MailboxGrant => {
            let number = mailbox.ok_or_else(unauthorized)?;
            let box_ = storage
                .mailbox(id, number, (options.now)())?
                .ok_or_else(unauthorized)?;
            let Some(entry) = swap.entries.first() else {
                return Err(unauthorized());
            };
            let TEntryPayload::AddDevice(add) = &entry.body.change else {
                return Err(unauthorized());
            };
            if !auth.member
                || box_.device != auth.request.device
                || !box_
                    .slots
                    .contains_key(&envden_core::adapters::storage::TMailboxSlot::PairJoiner)
                || entry.body.signer != auth.request.device
                || storage
                    .state(
                        id,
                        TStateKind::MailboxJoiner,
                        &[(number >> 8) as u8, number as u8],
                    )?
                    .as_deref()
                    != Some(add.device.id.as_slice())
            {
                return Err(unauthorized());
            }
            stored.close_mailbox = Some(number);
            stored.approver = Some(IApproverWrite {
                device: add.device.id.to_vec(),
                bytes: swap.approver.clone().ok_or_else(unauthorized)?,
            });
            stored.devices = Some(vec![IDeviceWrite {
                id: add.device.id.to_vec(),
                state: IStoredDevice {
                    unlocked_until: storage
                        .device(id, &auth.request.device)?
                        .unwrap_or_default()
                        .unlocked_until,
                    fresh_until: 0,
                    client_version: String::new(),
                    mailbox_grant: None,
                },
            }]);
        }
        TAuthorization::MoveSession => {
            if !auth.member
                || storage.vault(id)?.is_none_or(|v| !v.frozen)
                || storage.state(id, TStateKind::MoveSession, &[])?.as_deref()
                    != Some(auth.request.device.as_slice())
            {
                return Err(unauthorized());
            }
        }
        TAuthorization::MoveImport => {
            if !auth.member || storage.vault(id)?.is_none_or(|v| v.active) {
                return Err(unauthorized());
            }
        }
    }

    Ok(())
}
