// Total days, never calendar months or years, so a long uptime isn't shown short.
pub fn format_uptime(seconds: u64) -> String {
    let parts: Vec<String> = [
        (seconds / 86400, "day"),
        (seconds % 86400 / 3600, "hour"),
        (seconds % 3600 / 60, "minute"),
    ]
    .into_iter()
    .filter(|(count, _)| *count > 0)
    .map(|(count, unit)| format!("{count} {unit}{}", if count == 1 { "" } else { "s" }))
    .collect();

    if parts.is_empty() {
        "under a minute".into()
    } else {
        parts.join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uptime_counts_total_days_hours_and_minutes() {
        assert_eq!(
            [0, 59, 60, 3660, 90000, 2775600, 34560060].map(format_uptime),
            [
                "under a minute",
                "under a minute",
                "1 minute",
                "1 hour 1 minute",
                "1 day 1 hour",
                "32 days 3 hours",
                "400 days 1 minute"
            ]
        );
        assert_eq!(format_uptime(1_000_000_000), "11574 days 1 hour 46 minutes");
    }
}
