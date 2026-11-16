use chrono::{Datelike, TimeDelta, Timelike};
use chrono_humanize::{Accuracy, HumanTime, Tense};

pub fn format_uptime(seconds: u64) -> String {
    let Some(end) = chrono::DateTime::from_timestamp(seconds as i64, 0) else {
        return "Invalid Date".into();
    };
    let duration = TimeDelta::days(i64::from(end.day() - 1))
        + TimeDelta::hours(i64::from(end.hour()))
        + TimeDelta::minutes(i64::from(end.minute()));

    if duration.is_zero() {
        "under a minute".into()
    } else {
        HumanTime::from(duration).to_text_en(Accuracy::Precise, Tense::Present)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uptime_omits_seconds_months_and_years() {
        assert_eq!(
            [0, 59, 60, 3660, 90000, 32 * 86400, 365 * 86400].map(format_uptime),
            [
                "under a minute",
                "under a minute",
                "1 minute",
                "1 hour and 1 minute",
                "1 day and 1 hour",
                "1 day",
                "under a minute"
            ]
        );
        assert_eq!(format_uptime(i64::MAX as u64), "Invalid Date");
    }
}
