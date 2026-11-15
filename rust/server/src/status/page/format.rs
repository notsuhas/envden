pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let exponent = ((bytes as f64).log2() / 10.0).floor() as usize;
    let value = bytes as f64 / 1024_f64.powi(exponent as i32);
    let decimals = (2_i32 - value.log10().floor() as i32).max(0) as usize;
    let text = format!("{value:.decimals$}");
    let text = if text.contains('.') {
        text.trim_end_matches('0').trim_end_matches('.')
    } else {
        &text
    };

    format!(
        "{text} {}",
        ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"][exponent]
    )
}

pub fn format_uptime(seconds: u64) -> String {
    use chrono::{Datelike, Timelike};
    let end = chrono::DateTime::from_timestamp(seconds as i64, 0).expect("uptime timestamp");
    let mut parts = Vec::new();
    for (value, unit) in [
        (u64::from(end.day() - 1), "day"),
        (u64::from(end.hour()), "hour"),
        (u64::from(end.minute()), "minute"),
    ] {
        if value > 0 {
            parts.push(format!(
                "{value} {unit}{}",
                if value == 1 { "" } else { "s" }
            ));
        }
    }

    if parts.is_empty() {
        "under a minute".into()
    } else {
        parts.join(" ")
    }
}

pub fn format_when(utc: &str, now: u64) -> String {
    let date = chrono::DateTime::parse_from_rfc3339(utc).expect("status timestamp");
    let difference = now as i128 - date.timestamp_millis() as i128;
    let seconds = difference.unsigned_abs() as f64 / 1000.0;
    let (scale, unit) = if seconds < 60.0 {
        (1.0, "second")
    } else if seconds < 3600.0 {
        (60.0, "minute")
    } else if seconds < 86400.0 {
        (3600.0, "hour")
    } else if seconds < 2592000.0 {
        (86400.0, "day")
    } else if seconds < 31536000.0 {
        (2592000.0, "month")
    } else {
        (31536000.0, "year")
    };
    let count = (seconds / scale).round() as u64;
    let relative = format!("{count} {unit}{}", if count == 1 { "" } else { "s" });
    let relative = if difference < 0 {
        format!("in {relative}")
    } else {
        format!("{relative} ago")
    };

    format!(
        "{relative} ({} UTC)",
        date.with_timezone(&chrono::Utc).format("%Y-%m-%d %H:%M")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_formats() {
        assert_eq!(
            [0, 1023, 1536, 5243180, 1073741824].map(format_bytes),
            ["0 B", "1023 B", "1.5 KiB", "5 MiB", "1 GiB"]
        );
        assert_eq!(
            [59, 3660, 90000].map(format_uptime),
            ["under a minute", "1 hour 1 minute", "1 day 1 hour"]
        );
        assert_eq!(format_uptime(32 * 86400), "1 day");
        assert_eq!(
            format_when("2027-01-15T08:00:00.000Z", 1800000720000),
            "12 minutes ago (2027-01-15 08:00 UTC)"
        );
    }
}
