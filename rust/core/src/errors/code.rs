use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorCode {
    InvalidInput,
    InvalidData,
    UpdateRequired,
    Rollback,
    Fork,
    NotMember,
    Unauthorized,
    Locked,
    RecoveryKitRequired,
    StorageQuota,
    RateLimited,
    Conflict,
    NotFound,
    HeadMoved,
    RestoredMode,
    Moving,
    ServerTooOld,
    ClientTooOld,
    NotImplemented,
    Internal,
    ServerUnreachable,
    Busy,
}

const ALL: [(ErrorCode, &str); 22] = [
    (ErrorCode::InvalidInput, "INVALID_INPUT"),
    (ErrorCode::InvalidData, "INVALID_DATA"),
    (ErrorCode::UpdateRequired, "UPDATE_REQUIRED"),
    (ErrorCode::Rollback, "ROLLBACK"),
    (ErrorCode::Fork, "FORK"),
    (ErrorCode::NotMember, "NOT_MEMBER"),
    (ErrorCode::Unauthorized, "UNAUTHORIZED"),
    (ErrorCode::Locked, "LOCKED"),
    (ErrorCode::RecoveryKitRequired, "RECOVERY_KIT_REQUIRED"),
    (ErrorCode::StorageQuota, "STORAGE_QUOTA"),
    (ErrorCode::RateLimited, "RATE_LIMITED"),
    (ErrorCode::Conflict, "CONFLICT"),
    (ErrorCode::NotFound, "NOT_FOUND"),
    (ErrorCode::HeadMoved, "HEAD_MOVED"),
    (ErrorCode::RestoredMode, "RESTORED_MODE"),
    (ErrorCode::Moving, "MOVING"),
    (ErrorCode::ServerTooOld, "SERVER_TOO_OLD"),
    (ErrorCode::ClientTooOld, "CLIENT_TOO_OLD"),
    (ErrorCode::NotImplemented, "NOT_IMPLEMENTED"),
    (ErrorCode::Internal, "INTERNAL"),
    (ErrorCode::ServerUnreachable, "SERVER_UNREACHABLE"),
    (ErrorCode::Busy, "BUSY"),
];

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        ALL.iter()
            .find(|(code, _)| *code == self)
            .map_or("INTERNAL", |(_, text)| text)
    }

    pub fn parse(text: &str) -> Option<Self> {
        ALL.iter()
            .find(|(_, name)| *name == text)
            .map(|(code, _)| *code)
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_every_code() {
        for (code, text) in ALL {
            assert_eq!(ErrorCode::parse(text), Some(code));
            assert_eq!(code.as_str(), text);
        }
        assert_eq!(ErrorCode::parse("NOPE"), None);
    }
}
