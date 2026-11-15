use crate::protocol::encoding::require_value;
use envden_core::errors::Result;

pub fn parse_semver(version: &str) -> Result<[String; 3]> {
    let parts: Vec<_> = version.split('.').collect();
    require_value(
        parts.len() == 3
            && parts.iter().all(|p| {
                !p.is_empty()
                    && p.bytes().all(|c| c.is_ascii_digit())
                    && (p.len() == 1 || !p.starts_with('0'))
            }),
        "Invalid version",
    )?;
    Ok([parts[0].into(), parts[1].into(), parts[2].into()])
}

pub fn compare_semver(a: &str, b: &str) -> Result<std::cmp::Ordering> {
    let a = parse_semver(a)?;
    let b = parse_semver(b)?;
    Ok(a.iter()
        .zip(b.iter())
        .map(|(a, b)| a.len().cmp(&b.len()).then(a.cmp(b)))
        .find(|o| !o.is_eq())
        .unwrap_or(std::cmp::Ordering::Equal))
}
