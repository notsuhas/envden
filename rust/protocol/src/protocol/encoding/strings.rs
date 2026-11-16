use super::binary::{ICodec, Reader, require_value, sized};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use unicode_general_category::{GeneralCategory, get_general_category};
use unicode_normalization::UnicodeNormalization;

pub fn valid_string(value: &str) -> Result<()> {
    require_value(
        value.nfc().eq(value.chars())
            && !value
                .chars()
                .any(|c| get_general_category(c) == GeneralCategory::Control),
        "Invalid string",
    )
}

impl ICodec for String {
    fn read(r: &mut Reader<'_>) -> Result<Self> {
        let value = String::from_utf8(r.sized(65536)?)
            .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid Unicode", e))?;
        valid_string(&value)?;
        Ok(value)
    }
    fn write(&self, out: &mut Vec<u8>) -> Result<()> {
        valid_string(self)?;
        sized(self.as_bytes(), 65536, out)
    }
}

pub fn ctx(label: &str) -> Vec<u8> {
    super::binary::encode(&format!("envden/v1/{label}")).expect("valid protocol label")
}

pub fn norm_pw(password: &str) -> Result<String> {
    let p: String = password.nfkc().collect();
    require_value(!p.is_empty(), "Empty password")?;
    Ok(p)
}

pub fn is_device_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && !name.chars().any(|c| {
            matches!(
                get_general_category(c),
                GeneralCategory::Format | GeneralCategory::Control
            )
        })
}
