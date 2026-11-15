use envden_core::errors::ErrorCode;

pub fn error_status(code: ErrorCode) -> u16 {
    use ErrorCode::*;
    match code {
        InvalidInput | InvalidData | RecoveryKitRequired => 400,
        Unauthorized | NotMember | Locked => 403,
        NotFound => 404,
        UpdateRequired | ServerTooOld | ClientTooOld => 426,
        NotImplemented => 501,
        ServerUnreachable | RateLimited | StorageQuota | Moving | Busy => 502,
        Internal => 500,
        _ => 409,
    }
}
