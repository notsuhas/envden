use super::validation::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IPendingResponse {
    pub kind: super::http::TPending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IDevicesResponse {
    pub devices: Vec<IDeviceResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IDeviceResponse {
    #[serde(deserialize_with = "binary::<_,32>")]
    pub id: String,
    #[serde(deserialize_with = "nullable")]
    pub client_version: Option<String>,
    pub confirmed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IRepairStatus {
    #[serde(deserialize_with = "binary::<_,32>")]
    pub restored_head: String,
    #[serde(deserialize_with = "binary::<_,32>")]
    pub repair_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IErrorResponse {
    #[serde(with = "error_code")]
    pub error: envden_core::errors::ErrorCode,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "optional_text")]
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IUnlockWindow {
    #[serde(deserialize_with = "nullable_integer")]
    pub unlocked_until: Option<u64>,
    #[serde(deserialize_with = "integer")]
    pub fresh_until: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum TCommitResponse {
    Committed {},
    RetryOfCommitted {},
    HeadMoved {
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "optional_id"
        )]
        head: Option<String>,
    },
}

fn optional_id<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    binary::<D, 32>(d).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum TTransferResponse {
    Moving {},
    Frozen {},
    Unfrozen {},
    Uploaded {},
    Stored {},
    Updated {},
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum TLoginFinishResponse {
    Ticket {},
    Staged {},
    Unlocked {
        #[serde(rename = "unlockedUntil", deserialize_with = "nullable_integer")]
        unlocked_until: Option<u64>,
        #[serde(rename = "freshUntil")]
        #[serde(deserialize_with = "integer")]
        fresh_until: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum TRegistrationResponse {
    Registered {},
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum TMailboxClosed {
    Closed {},
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IObjectsResponse {
    #[serde(deserialize_with = "objects")]
    pub objects: Vec<String>,
}

fn objects<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
    use serde::de::Error;
    let values = Vec::<String>::deserialize(d)?;
    for v in &values {
        binary::<serde::de::value::StrDeserializer<serde::de::value::Error>, 3200182>(
            serde::de::value::StrDeserializer::new(v),
        )
        .map_err(D::Error::custom)?;
    }
    Ok(values)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum TRepairFinish {
    Login {
        purpose: TUnlockPurpose,
        #[serde(deserialize_with = "opaque::<_,64>")]
        message: String,
        #[serde(deserialize_with = "binary::<_,3200182>")]
        swap: String,
    },
    Registration {
        #[serde(deserialize_with = "opaque::<_,192>")]
        message: String,
        #[serde(deserialize_with = "binary::<_,3200182>")]
        swap: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TUnlockPurpose {
    Unlock,
}

mod error_code {
    use envden_core::errors::ErrorCode;
    use serde::{Deserialize, Deserializer, Serializer, de::Error};
    pub fn serialize<S: Serializer>(v: &ErrorCode, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(v.as_str())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<ErrorCode, D::Error> {
        ErrorCode::parse(&String::deserialize(d)?)
            .ok_or_else(|| D::Error::custom("Invalid error code"))
    }
}

fn optional_text<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    String::deserialize(d).map(Some)
}
