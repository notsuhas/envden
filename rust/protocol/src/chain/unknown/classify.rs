use crate::protocol::*;
use envden_core::errors::Result;

#[derive(Debug, PartialEq, Eq)]
pub enum TUnknownData {
    Known,
    Rollback,
    Fork,
    Invalid,
    UpdateRequired,
    Unreadable,
}

pub struct IUnknownData<'a> {
    pub received: &'a [u8],
    pub stored: Option<&'a [u8]>,
    pub mismatch: TUnknownData,
    pub unknown_format: bool,
    pub current_version: &'a str,
    pub latest_version: &'a str,
}

pub fn classify_unknown_data(
    input: IUnknownData<'_>,
    verify: impl FnOnce() -> bool,
) -> Result<TUnknownData> {
    if input.stored.is_some_and(|s| s != input.received) {
        return Ok(input.mismatch);
    }
    if !verify() {
        return Ok(TUnknownData::Invalid);
    }
    if !input.unknown_format {
        return Ok(TUnknownData::Known);
    }
    Ok(
        if compare_semver(input.current_version, input.latest_version)?.is_lt() {
            TUnknownData::UpdateRequired
        } else {
            TUnknownData::Unreadable
        },
    )
}

pub enum TServerObject<T> {
    Known { value: ISigned<T> },
    Unknown(TUnknownData),
}

pub fn decode_server_object<T: ICodec>(
    mut input: IUnknownData<'_>,
    members: &[([u8; 16], [u8; 32])],
    label: &str,
) -> Result<TServerObject<T>> {
    let raw = input.received;
    let tag = match label {
        "entry" => 1,
        "manifest" => 2,
        _ => 11,
    };
    input.unknown_format = raw.first() != Some(&tag)
        || raw.get(1) != Some(&1)
        || (label == "entry" && raw.len() >= 155 && raw[74] > 7)
        || (label == "manifest" && raw.len() >= 123 && raw[42] > 13);
    let result = classify_unknown_data(input, || verify_raw_object(raw, members, label))?;
    if result != TUnknownData::Known {
        return Ok(TServerObject::Unknown(result));
    }
    Ok(match decode(raw) {
        Ok(value) => TServerObject::Known { value },
        Err(_) => TServerObject::Unknown(TUnknownData::Invalid),
    })
}
