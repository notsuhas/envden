use super::lookup::lookup;
use crate::{http::types::IAppOptions, middleware::IAuth};
use envden_core::{
    adapters::storage::{IStoredMailbox, TMailboxSlot, TRateBucket, TRateCharge, TStateKind},
    errors::{EnvdenError, ErrorCode, Result},
};
use sha2::{Digest, Sha256};

pub(super) struct IAccess {
    pub mailbox: IStoredMailbox,
    pub vault: Vec<u8>,
    pub binding: Vec<u8>,
    pub bound: Option<Vec<u8>>,
}

pub(super) fn slot(value: &str) -> Result<TMailboxSlot> {
    match value {
        "KE1" => Ok(TMailboxSlot::KE1),
        "KE2" => Ok(TMailboxSlot::KE2),
        "KE3" => Ok(TMailboxSlot::KE3),
        "PairJoiner" => Ok(TMailboxSlot::PairJoiner),
        _ => Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Invalid mailbox slot",
        )),
    }
}

fn allowed(owner: bool, write: bool, slot: TMailboxSlot) -> bool {
    let responder = slot == TMailboxSlot::KE2;

    if write {
        owner == responder
    } else {
        responder || owner
    }
}

pub(super) fn accessible(
    options: &IAppOptions,
    auth: &IAuth,
    number: u64,
    slot: TMailboxSlot,
    write: bool,
) -> Result<IAccess> {
    let storage = options.storage.as_ref();
    let vault = lookup(
        storage,
        &auth.request.vault_id,
        &format!("mailbox/{number}"),
    )?;
    let mailbox = storage
        .mailbox(&vault, number, (options.now)())?
        .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Mailbox closed"))?;
    let owner = mailbox.device == auth.request.device;
    if !allowed(owner, write, slot) {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Wrong mailbox side",
        ));
    }
    let binding = vec![(number >> 8) as u8, number as u8];
    let bound = storage.state(&vault, TStateKind::MailboxJoiner, &binding)?;
    if !owner
        && bound
            .as_ref()
            .is_some_and(|b| b.as_slice() != auth.request.device)
    {
        return Err(EnvdenError::new(ErrorCode::Unauthorized, "Wrong joiner"));
    }
    if !owner && bound.is_none() && (!write || slot != TMailboxSlot::KE1) {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Joiner not bound",
        ));
    }

    Ok(IAccess {
        mailbox,
        vault,
        binding,
        bound,
    })
}

pub(crate) fn preauthorize(
    options: &IAppOptions,
    auth: &IAuth,
    path: &str,
    method: &str,
) -> Result<()> {
    let parts: Vec<_> = path.split('/').collect();
    let ["", "v1", "pairing", "mailboxes", number, slot_name] = parts.as_slice() else {
        return Ok(());
    };
    let number = number
        .parse()
        .map_err(|_| EnvdenError::new(ErrorCode::InvalidInput, "Invalid mailbox number"))?;
    let slot = slot(slot_name)?;
    let result = accessible(options, auth, number, slot, method == "PUT");
    if method == "PUT" && !auth.member {
        let storage = options.storage.as_ref();
        let vault = lookup(
            storage,
            &auth.request.vault_id,
            &format!("mailbox/{number}"),
        )?;
        let mailbox = storage
            .mailbox(&vault, number, (options.now)())?
            .ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Mailbox closed"))?;
        let mut key = Sha256::digest(
            [
                format!("mailbox/{number}/{}/", mailbox.expires_at).as_bytes(),
                &vault,
            ]
            .concat(),
        )
        .to_vec();
        if result.is_err() {
            key = Sha256::digest([b"rejected/".as_slice(), &key].concat()).to_vec();
        }
        if matches!(
            storage.charge(
                &key,
                &TRateBucket::Mailbox { device: None },
                (options.now)()
            )?,
            TRateCharge::Locked { .. }
        ) {
            return Err(EnvdenError::new(
                ErrorCode::RateLimited,
                "Too many mailbox writes",
            ));
        }
    }

    result.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mailbox_side_matrix() {
        for (slot, expected) in [
            (TMailboxSlot::KE1, [false, true, true, false]),
            (TMailboxSlot::KE2, [true, false, true, true]),
            (TMailboxSlot::KE3, [false, true, true, false]),
            (TMailboxSlot::PairJoiner, [false, true, true, false]),
        ] {
            assert_eq!(
                [
                    allowed(true, true, slot),
                    allowed(false, true, slot),
                    allowed(true, false, slot),
                    allowed(false, false, slot)
                ],
                expected
            );
        }
    }
}
