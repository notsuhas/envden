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

pub fn encode(text: &str) -> Vec<u8> {
    // WinAnsi uses the space and hyphen glyphs for these characters.
    lopdf::Document::encode_text(
        &lopdf::Encoding::SimpleEncoding(b"WinAnsiEncoding"),
        &printable(text)
            .replace('\u{a0}', " ")
            .replace('\u{ad}', "-"),
    )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn win_ansi_encoding_matches_supported_characters() {
        for (text, metric) in METRICS["mapping"].as_object().unwrap() {
            let encoding = lopdf::Encoding::SimpleEncoding(b"WinAnsiEncoding");
            let expected =
                lopdf::Document::decode_text(&encoding, &[metric[0].as_u64().unwrap() as u8])
                    .unwrap();
            let actual = lopdf::Document::decode_text(&encoding, &encode(text)).unwrap();
            assert_eq!(actual, expected, "{text:?}");
        }
        assert_eq!(printable("café 💻 東京\n"), "café ? ???");
    }
}
