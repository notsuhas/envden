use chrono_humanize::{Accuracy, HumanTime, Tense};

pub fn format_when(utc: &str, now: u64) -> String {
    let Ok(date) = chrono::DateTime::parse_from_rfc3339(utc) else {
        return "Invalid Date".into();
    };
    let Some(now) = i64::try_from(now)
        .ok()
        .and_then(chrono::DateTime::from_timestamp_millis)
    else {
        return "Invalid Date".into();
    };
    let difference = date.signed_duration_since(now);
    let tense = if difference > chrono::TimeDelta::zero() {
        Tense::Future
    } else {
        Tense::Past
    };
    let relative = HumanTime::from(difference).to_text_en(Accuracy::Precise, tense);

    format!(
        "{relative} ({} UTC)",
        date.with_timezone(&chrono::Utc).format("%Y-%m-%d %H:%M")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elapsed_dates_keep_utc_instant_and_direction() {
        let at = "2027-01-01T00:00:00.000Z";
        let now = 1_798_761_600_000;
        for (time, expected) in [
            (now, "0 seconds ago"),
            (now + 500, "500 ms ago"),
            (now + 3 * 86400000, "3 days ago"),
            (now - 60000, "in 1 minute"),
            (now + 354 * 86400000, "11 months, 3 weeks and 3 days ago"),
        ] {
            assert_eq!(
                format_when(at, time),
                format!("{expected} (2027-01-01 00:00 UTC)")
            );
        }
        assert_eq!(
            format_when("2027-01-01T05:30:00+05:30", now),
            format_when(at, now)
        );
        assert_eq!(format_when("invalid", now), "Invalid Date");
        assert_eq!(format_when(at, u64::MAX), "Invalid Date");
    }
}
