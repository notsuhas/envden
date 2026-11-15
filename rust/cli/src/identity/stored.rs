use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ISecretKeys {
    pub enc_sk: [u8; 32],
    pub obj_sk: [u8; 32],
    pub req_sk: [u8; 32],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IDeviceIdentity {
    pub keys: ISecretKeys,
    pub record: p::IDeviceRecord,
}

pub fn identity_bytes(keys: &ISecretKeys, record: &p::IDeviceRecord) -> Result<Vec<u8>> {
    Ok([
        keys.enc_sk.as_slice(),
        &keys.obj_sk,
        &keys.req_sk,
        &p::encode(record)?,
    ]
    .concat())
}

pub fn read_identity(stored: &[u8]) -> Result<IDeviceIdentity> {
    if stored.len() < 96 {
        return Err(invalid());
    }
    let keys = ISecretKeys {
        enc_sk: p::fixed(&stored[..32])?,
        obj_sk: p::fixed(&stored[32..64])?,
        req_sk: p::fixed(&stored[64..96])?,
    };
    let record: p::IDeviceRecord = p::decode(&stored[96..])?;
    let mut seeds = [keys.enc_sk, keys.obj_sk, keys.req_sk].into_iter();
    let derived = p::generate_device_keys(|| seeds.next().expect("three keys"));
    if derived.recovery.enc_pub != record.enc_pub
        || derived.recovery.obj_pub != record.obj_pub
        || derived.req_pub != record.req_pub
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Device keys do not match their public record",
        ));
    }
    if p::device_id(&record.enc_pub, &record.obj_pub, &record.req_pub) != record.id {
        return Err(invalid());
    }
    Ok(IDeviceIdentity { keys, record })
}

fn invalid() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, "Invalid device identity")
}
