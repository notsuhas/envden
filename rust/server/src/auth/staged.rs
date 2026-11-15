use crate::http::types::IAppOptions;
use envden_core::{
    adapters::storage::{ISessionKey, IStateWrite, TSessionKind, TStateKind},
    errors::Result,
};

pub(crate) fn refund_registration(
    options: &IAppOptions,
    vault: &[u8],
    device: &[u8],
) -> Result<()> {
    let key = b"registration-receipt";
    let receipt = match options.storage.state(vault, TStateKind::MoveSession, key)? {
        Some(receipt) => Some(receipt),
        None => options.storage.consume_session(
            vault,
            &ISessionKey {
                kind: TSessionKind::Login,
                device: device.to_vec(),
                purpose: "registration-receipt".into(),
            },
            (options.now)(),
        )?,
    };
    options.storage.write_state(
        vault,
        &[IStateWrite {
            kind: TStateKind::MoveSession,
            key: key.to_vec(),
            bytes: None,
        }],
    )?;
    if let Some(receipt) = receipt {
        options
            .storage
            .refund(&String::from_utf8_lossy(&receipt), (options.now)())?;
    }

    Ok(())
}
