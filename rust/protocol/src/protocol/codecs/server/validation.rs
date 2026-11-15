use crate::protocol::opaque::opaque_message;
use serde::{Deserialize, Deserializer, de::Error};

pub fn opaque<'de, D: Deserializer<'de>, const N: usize>(d: D) -> Result<String, D::Error> {
    let s = String::deserialize(d)?;
    opaque_message(&s, N).map_err(D::Error::custom)?;
    Ok(s)
}

pub fn binary<'de, D: Deserializer<'de>, const N: usize>(d: D) -> Result<String, D::Error> {
    let s = String::deserialize(d)?;
    if s.is_empty()
        || s.len() > (N * 4).div_ceil(3)
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(D::Error::custom("Invalid binary encoding"));
    }
    Ok(s)
}

pub fn mailbox<'de, D: Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    let n = integer::<D>(d)?;
    if !(1..=999).contains(&n) {
        return Err(D::Error::custom("Invalid mailbox"));
    }
    Ok(n as u32)
}

pub fn period<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
    let p = nullable_integer(d)?;
    if p.is_some_and(|n| ![86400000, 604800000, 2592000000].contains(&n)) {
        return Err(D::Error::custom("Invalid unlock period"));
    }
    Ok(p)
}

pub fn mailbox_message<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    let s = String::deserialize(d)?;
    if s.encode_utf16().count() > 5462 {
        return Err(D::Error::custom("Mailbox message limit"));
    }
    Ok(s)
}

pub fn nullable<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> Result<Option<T>, D::Error> {
    Option::deserialize(d)
}

pub fn signed_integer<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
    let n = f64::deserialize(d)?;
    if !n.is_finite() || n.fract() != 0.0 || n.abs() > 9007199254740991.0 {
        return Err(D::Error::custom("Invalid integer"));
    }
    Ok(n as i64)
}
pub fn integer<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let n = signed_integer(d)?;
    if n < 0 {
        return Err(D::Error::custom("Invalid count"));
    }
    Ok(n as u64)
}
pub fn nullable_integer<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
    let n = Option::<f64>::deserialize(d)?;
    n.map(|n| {
        if !n.is_finite() || n.fract() != 0.0 || !(0.0..=9007199254740991.0).contains(&n) {
            return Err(D::Error::custom("Invalid count"));
        }
        Ok(n as u64)
    })
    .transpose()
}
