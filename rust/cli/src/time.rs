use chrono::{DateTime, Local, Offset, TimeZone, Utc};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub type TClock = fn() -> u64;

pub fn local_time(utc: i64, zone: Option<&str>) -> Result<String> {
    let instant = DateTime::<Utc>::from_timestamp_millis(utc).ok_or_else(invalid)?;
    let (date, offset) = if let Some(zone) = zone {
        let zone: chrono_tz::Tz = zone.parse().map_err(|_| invalid())?;
        let date = instant.with_timezone(&zone);
        (
            date.format("%Y-%m-%d %H:%M").to_string(),
            date.offset().fix().local_minus_utc(),
        )
    } else {
        let date = Local.from_utc_datetime(&instant.naive_utc());
        (
            date.format("%Y-%m-%d %H:%M").to_string(),
            date.offset().local_minus_utc(),
        )
    };
    let sign = if offset < 0 { '-' } else { '+' };
    let minutes = offset.unsigned_abs() / 60;
    let suffix = if minutes % 60 == 0 {
        String::new()
    } else {
        format!(":{:02}", minutes % 60)
    };
    Ok(format!("{date} GMT{sign}{}{suffix}", minutes / 60))
}

pub fn relative_time(utc: i64, now: i64) -> String {
    let seconds = (utc as f64 - now as f64).abs() / 1000.0;
    let (size, unit) = if seconds < 60.0 {
        (1.0, "second")
    } else if seconds < 3600.0 {
        (60.0, "minute")
    } else if seconds < 86400.0 {
        (3600.0, "hour")
    } else if seconds < 2_592_000.0 {
        (86400.0, "day")
    } else if seconds < 31_536_000.0 {
        (2_592_000.0, "month")
    } else {
        (31_536_000.0, "year")
    };
    let count = (seconds / size).round() as u64;
    let text = format!("{count} {unit}{}", if count == 1 { "" } else { "s" });
    if utc > now {
        format!("in {text}")
    } else {
        format!("{text} ago")
    }
}

pub fn when_text(utc: i64, now: i64, zone: Option<&str>) -> Result<String> {
    Ok(format!(
        "{} ({})",
        relative_time(utc, now),
        local_time(utc, zone)?
    ))
}

fn invalid() -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidInput, "Invalid time value")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn formats_local_and_relative_times() {
        let at = 1_800_000_000_000;
        assert_eq!(relative_time(at, at + 600_000), "10 minutes ago");
        assert_eq!(relative_time(at, at - 30 * 86_400_000), "in 1 month");
        assert!(
            local_time(at, Some("Asia/Kolkata"))
                .unwrap()
                .ends_with("GMT+5:30")
        );
    }
}
