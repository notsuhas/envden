use serde_json::Value;
use std::sync::LazyLock;
static METRICS: LazyLock<Value> =
    LazyLock::new(|| serde_json::from_str(include_str!("metrics.json")).expect("font metrics"));

pub fn printable(text: &str) -> String {
    text.chars()
        .map(|c| {
            if METRICS["mapping"].get(c.to_string()).is_some() {
                c
            } else {
                '?'
            }
        })
        .collect()
}

pub fn hex(text: &str) -> String {
    printable(text)
        .chars()
        .map(|c| {
            format!(
                "{:02X}",
                METRICS["mapping"][c.to_string()][0].as_u64().expect("code")
            )
        })
        .collect()
}

pub fn width(text: &str, size: f64) -> f64 {
    let chars: Vec<_> = text.chars().collect();
    let mut total = 0.0;
    for (index, c) in chars.iter().enumerate() {
        total += METRICS["mapping"][c.to_string()][1]
            .as_f64()
            .unwrap_or(250.0);
        if let Some(next) = chars.get(index + 1) {
            total += METRICS["kern"][format!("{c}{next}")]
                .as_f64()
                .unwrap_or(0.0);
        }
    }
    total * (size / 1000.0)
}

pub fn suffix(index: usize) -> u64 {
    METRICS["suffixes"][index].as_u64().expect("font suffix")
}

pub fn utf16(text: &str) -> String {
    format!(
        "FEFF{}",
        text.encode_utf16()
            .map(|c| format!("{c:04X}"))
            .collect::<String>()
    )
}
