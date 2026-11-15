use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode},
};

pub(crate) fn fail(error: impl std::error::Error + Send + Sync + 'static) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Storage operation failed", error)
}
pub(crate) fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::Internal, message)
}
pub(crate) fn seq(value: u64) -> String {
    format!("{value:020}")
}
pub(crate) fn name(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        "empty".into()
    } else {
        hex::encode(bytes)
    }
}
pub(crate) fn kind(kind: TStateKind) -> &'static str {
    match kind {
        TStateKind::Keyring => "keyring",
        TStateKind::Envelope => "envelope",
        TStateKind::SkPub => "skPub",
        TStateKind::OpaqueRecord => "opaqueRecord",
        TStateKind::RepairReport => "repair-report",
        TStateKind::MoveSession => "move-session",
        TStateKind::SetupIssued => "setup-issued",
        TStateKind::ServerIdentity => "server-identity",
        TStateKind::PairingIndex => "pairing-index",
        TStateKind::MailboxJoiner => "mailbox-joiner",
    }
}
pub(crate) fn session_kind(kind: TSessionKind) -> &'static str {
    match kind {
        TSessionKind::Login => "login",
        TSessionKind::JoinTicket => "join-ticket",
    }
}
pub(crate) fn slot_name(slot: TMailboxSlot) -> &'static str {
    match slot {
        TMailboxSlot::KE1 => "KE1",
        TMailboxSlot::KE2 => "KE2",
        TMailboxSlot::KE3 => "KE3",
        TMailboxSlot::PairJoiner => "PairJoiner",
    }
}
