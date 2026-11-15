use super::validation::{integer, nullable};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IStatusResponse {
    pub version: String,
    #[serde(deserialize_with = "integer")]
    pub uptime_seconds: u64,
    pub mode: TServerMode,
    #[serde(deserialize_with = "integer")]
    pub vaults: u64,
    #[serde(deserialize_with = "integer")]
    pub storage_bytes: u64,
    #[serde(deserialize_with = "nullable")]
    pub fullest_vault: Option<TQuotaBand>,
    #[serde(deserialize_with = "nullable")]
    pub last_prune: Option<ILastPrune>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ILastPrune {
    #[serde(deserialize_with = "iso_datetime")]
    pub at: String,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TServerMode {
    Normal,
    Restored,
    Moved,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TQuotaBand {
    #[serde(rename = "below-50")]
    Below50,
    #[serde(rename = "50-80")]
    From50To80,
    #[serde(rename = "80-95")]
    From80To95,
    #[serde(rename = "95-plus")]
    Plus95,
}

fn iso_datetime<'de, D: serde::Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    use serde::de::Error;
    let s = String::deserialize(d)?;
    if !valid_datetime(&s) {
        return Err(D::Error::custom("Invalid ISO datetime"));
    }
    Ok(s)
}

fn valid_datetime(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() < 20
        || !s.is_ascii()
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b.last() != Some(&b'Z')
    {
        return false;
    }
    let n = |a: usize, z: usize| s[a..z].parse::<u32>().ok();
    let (Some(y), Some(m), Some(d), Some(h), Some(min), Some(sec)) =
        (n(0, 4), n(5, 7), n(8, 10), n(11, 13), n(14, 16), n(17, 19))
    else {
        return false;
    };
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    d >= 1
        && d <= days
        && h < 24
        && min < 60
        && sec < 60
        && (b.len() == 20
            || (b.len() > 21 && b[19] == b'.' && b[20..b.len() - 1].iter().all(u8::is_ascii_digit)))
}

pub type TStatusResponse = IStatusResponse;
