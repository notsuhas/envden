use envden_core::errors::{EnvdenError, ErrorCode};
use serde_json::Value;

pub fn response_error(data: &Value, path: &str) -> EnvdenError {
    if data.get("kind").and_then(Value::as_str) == Some("head-moved") {
        return EnvdenError::new(ErrorCode::HeadMoved, message(ErrorCode::HeadMoved));
    }
    let Ok(parsed) =
        serde_json::from_value::<envden_protocol::protocol::IErrorResponse>(data.clone())
    else {
        return EnvdenError::new(ErrorCode::InvalidData, "Invalid server response");
    };
    let code = parsed.error;
    let text = if path.starts_with("/v1/pairing/")
        && matches!(
            code,
            ErrorCode::NotFound | ErrorCode::Conflict | ErrorCode::Unauthorized
        ) {
        "Pairing code expired or already used. Run envden device add for a new one"
    } else if path.starts_with("/v1/opaque/login/") && code == ErrorCode::Unauthorized {
        "Login expired or the vault moved. Check the server address and try again"
    } else {
        message(code)
    };
    EnvdenError::new(code, text)
}

fn message(code: ErrorCode) -> &'static str {
    match code {
        ErrorCode::InvalidInput => "Server rejected the request. Update envden and try again",
        ErrorCode::InvalidData => "Server rejected the data. Update envden and try again",
        ErrorCode::UpdateRequired => "Server uses a newer format. Update envden",
        ErrorCode::Rollback => "Server is behind this device. Run envden server repair",
        ErrorCode::Fork => "Server history conflicts with this device. Run envden server repair",
        ErrorCode::NotMember => "This device was removed from the vault. Run envden join to rejoin",
        ErrorCode::Unauthorized => {
            "Server rejected this device's signature. Check the system clock and try again"
        }
        ErrorCode::Locked => "Unlock expired. Run envden unlock",
        ErrorCode::RecoveryKitRequired => {
            "Replace the recovery kit first. Run envden vault kit replace"
        }
        ErrorCode::StorageQuota => {
            "Vault storage on the server is full. Remove files with envden rm, or ask the server owner for more space"
        }
        ErrorCode::RateLimited => "Too many attempts. Wait 15 minutes and try again",
        ErrorCode::Conflict => "Server state changed during the request. Run the command again",
        ErrorCode::NotFound => {
            "Server doesn't know this vault. Check the server address with envden status"
        }
        ErrorCode::HeadMoved => "Another device changed the vault. Run the command again",
        ErrorCode::RestoredMode => "Server was restored from a backup. Run envden server repair",
        ErrorCode::Moving => "Vault is moving to another server. Try again when the move finishes",
        ErrorCode::ServerTooOld => "Server is too old for this envden. Update the server",
        ErrorCode::ClientTooOld => "This envden is too old for the server. Update envden",
        ErrorCode::NotImplemented => "Server doesn't support this yet. Update the server",
        ErrorCode::Internal => "Server hit an internal error. Check the server logs",
        ErrorCode::ServerUnreachable => "Server can't reach its storage. Try again later",
        ErrorCode::Busy => "Server is busy. Try again in a minute",
    }
}
