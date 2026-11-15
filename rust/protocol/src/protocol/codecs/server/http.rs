use super::validation::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ILoginStart {
    pub purpose: TLoginPurpose,
    #[serde(deserialize_with = "opaque::<_,96>")]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ILoginFinish {
    pub purpose: TLoginPurpose,
    #[serde(deserialize_with = "opaque::<_,64>")]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IRegistrationStart {
    #[serde(deserialize_with = "opaque::<_,32>")]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IRegistrationFinish {
    #[serde(deserialize_with = "opaque::<_,192>")]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IUnlockPeriod {
    #[serde(deserialize_with = "period")]
    pub period: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IMailboxWrite {
    #[serde(deserialize_with = "mailbox_message")]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IMessageResponse {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IHelloResponse {
    pub hello: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IMailboxOpened {
    #[serde(deserialize_with = "mailbox")]
    pub number: u32,
    #[serde(deserialize_with = "signed_integer")]
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TLoginPurpose {
    Unlock,
    Kit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TMailboxSlot {
    KE1,
    KE2,
    KE3,
    PairJoiner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum TMailboxSlotResponse {
    Message {
        message: String,
        #[serde(rename = "expiresAt")]
        #[serde(deserialize_with = "signed_integer")]
        expires_at: i64,
    },
    Pending {
        kind: TPending,
        #[serde(rename = "expiresAt")]
        #[serde(deserialize_with = "signed_integer")]
        expires_at: i64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TPending {
    Pending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TMailboxWriteKind {
    Written,
    Identical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IMailboxWriteResponse {
    pub kind: TMailboxWriteKind,
    #[serde(deserialize_with = "signed_integer")]
    pub expires_at: i64,
}
