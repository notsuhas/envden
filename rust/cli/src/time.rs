use chrono::{DateTime, Local, Offset, TimeZone, Utc};
use envden_core::errors::{EnvdenError, ErrorCode, Result};

pub type TClock = fn() -> u64;
pub type TSharedClock = std::rc::Rc<dyn Fn() -> u64>;

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
    distance(utc, now, &Local)
}

// Day and longer units count wall-clock time in `zone`, so a DST change does not shift them.
fn distance<Tz: TimeZone>(utc: i64, now: i64, zone: &Tz) -> String {
    let (earlier, later) = if utc > now { (now, utc) } else { (utc, now) };
    let milliseconds = later as f64 - earlier as f64;
    let minutes = milliseconds / 60_000.0;
    let wall_minutes = (milliseconds
        + (offset_millis(zone, later) - offset_millis(zone, earlier)) as f64)
        / 60_000.0;

    let (count, unit) = if minutes < 1.0 {
        ((milliseconds / 1000.0).round(), "second")
    } else if minutes < 60.0 {
        (minutes.round(), "minute")
    } else if minutes < 1440.0 {
        ((minutes / 60.0).round(), "hour")
    } else if wall_minutes < 43_200.0 {
        ((wall_minutes / 1440.0).round(), "day")
    } else if wall_minutes < 525_600.0 {
        match (wall_minutes / 43_200.0).round() {
            12.0 => (1.0, "year"),
            months => (months, "month"),
        }
    } else {
        ((wall_minutes / 525_600.0).round(), "year")
    };
    let text = format!("{count} {unit}{}", if count == 1.0 { "" } else { "s" });

    if utc > now {
        format!("in {text}")
    } else {
        format!("{text} ago")
    }
}

fn offset_millis<Tz: TimeZone>(zone: &Tz, utc: i64) -> i64 {
    zone.timestamp_millis_opt(utc).single().map_or(0, |date| {
        i64::from(date.offset().fix().local_minus_utc()) * 1000
    })
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

    #[test]
    fn formats_zone_offsets_as_short_gmt() {
        let rows = [
            ("UTC", 1_773_144_000_000, "2026-03-10 12:00 GMT+0"),
            (
                "America/St_Johns",
                1_773_144_000_000,
                "2026-03-10 09:30 GMT-2:30",
            ),
            (
                "America/New_York",
                1_785_000_000_000,
                "2026-07-25 13:20 GMT-4",
            ),
            (
                "Asia/Kathmandu",
                1_785_000_000_000,
                "2026-07-25 23:05 GMT+5:45",
            ),
            (
                "Pacific/Chatham",
                1_773_144_000_000,
                "2026-03-11 01:45 GMT+13:45",
            ),
            ("Etc/GMT+12", 1_773_144_000_000, "2026-03-10 00:00 GMT-12"),
            (
                "Pacific/Kiritimati",
                1_785_000_000_000,
                "2026-07-26 07:20 GMT+14",
            ),
        ];

        for (zone, utc, text) in rows {
            assert_eq!(local_time(utc, Some(zone)).unwrap(), text);
        }
        assert!(local_time(0, Some("Nope/Zone")).is_err());
    }

    #[test]
    fn matches_strict_distance_rounding_and_wall_clock_days() {
        let now = 1_773_144_000_000;
        let new_york = chrono_tz::America::New_York;
        let rows = [
            (0, "0 seconds ago", "0 seconds ago"),
            (499, "in 0 seconds", "in 0 seconds"),
            (-500, "1 second ago", "1 second ago"),
            (-89_999, "1 minute ago", "1 minute ago"),
            (-5_400_000, "2 hours ago", "2 hours ago"),
            (-216_000_000, "3 days ago", "3 days ago"),
            (-212_400_000, "2 days ago", "3 days ago"),
            (2_592_000_000, "in 1 month", "in 1 month"),
            (-29_808_000_000, "1 year ago", "1 year ago"),
            (29_808_000_000, "in 1 year", "in 11 months"),
            (-31_449_600_000, "1 year ago", "1 year ago"),
        ];

        for (offset, utc, local) in rows {
            assert_eq!(distance(now + offset, now, &Utc), utc, "{offset}");
            assert_eq!(distance(now + offset, now, &new_york), local, "{offset}");
        }
    }
}

mod wait;
pub(crate) use wait::wait;
