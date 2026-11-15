use crate::{
    client::{binary, text},
    state::files::atomic_write,
    sync::remote::context::ISyncContext,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize)]
pub(super) struct IAttempt {
    pub(super) header: String,
    pub(super) sequence: String,
    pub(super) places: Vec<String>,
    pub(super) entries: Vec<String>,
}

pub fn save_attempt(
    context: &ISyncContext<'_>,
    entries: &[p::IFileEntry],
    header: &p::ISigned<p::IManifestHeader>,
    places: Vec<String>,
) -> Result<()> {
    let document = serde_json::to_string(&IAttempt {
        header: text(&p::object_hash(header, "manifest")?),
        sequence: header.body.seq.to_string(),
        places,
        entries: entries
            .iter()
            .map(|e| p::encode(e).map(|b| text(&b)))
            .collect::<Result<_>>()?,
    })
    .unwrap();
    let receipt = text(&Sha256::digest(document.as_bytes()));
    atomic_write(
        &context.adapters.home.join("state/attempts").join(receipt),
        document.as_bytes(),
        (context.options.now)(),
    )
}

pub(super) fn decode(saved: &str, receipt: &str) -> Result<IAttempt> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidData, "Invalid attempt record");
    if text(&Sha256::digest(saved.as_bytes())) != receipt {
        return Err(invalid());
    }
    let record: IAttempt = serde_json::from_str(saved).map_err(|_| invalid())?;
    if record.header.len() != 43
        || record.sequence.len() > 20
        || !record
            .header
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || record.sequence.is_empty()
        || !record.sequence.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(invalid());
    }
    for entry in &record.entries {
        let _: p::IFileEntry = p::decode(&binary(entry)?)?;
    }
    Ok(record)
}
