use super::{fonts, writer};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use serde_json::Value;

struct IPen {
    content: String,
    resources: String,
    count: usize,
}

impl IPen {
    fn write(&mut self, text: &str, x: f64, y: f64, font: &str, size: f64, muted: bool) {
        let suffix = fonts::suffix(self.count);
        self.count += 1;
        let name = format!("{font}-{suffix}");
        let reference = match font {
            "Helvetica" => 5,
            "Helvetica-Bold" => 6,
            _ => 7,
        };
        self.resources
            .push_str(&format!("/{name} {reference} 0 R\n"));
        let color = if muted {
            "0.42 0.42 0.46"
        } else {
            "0.1 0.1 0.12"
        };
        self.content.push_str(&format!(
            "q\nBT\n{color} rg\n/{name} {size} Tf\n24 TL\n1 0 0 1 {x} {y} Tm\n<{}> Tj\nT*\nET\nQ\n",
            fonts::hex(text)
        ));
    }
}

pub fn render_kit(kit: &Value, now: u64, device: &str) -> Result<Vec<u8>> {
    render_at_zone(kit, now, device, std::env::var("TZ").ok().as_deref())
}

fn render_at_zone(kit: &Value, now: u64, device: &str, zone: Option<&str>) -> Result<Vec<u8>> {
    let server = kit["server"].as_str().unwrap_or_default();
    let mut pen = IPen {
        content: String::new(),
        resources: String::new(),
        count: 0,
    };
    let mut y = 841.89 - 64.0 - 24.0;
    pen.write(
        "envden Recovery Kit",
        64.0,
        y,
        "Helvetica-Bold",
        24.0,
        false,
    );
    y -= 10.0;
    for (label, value) in [
        ("Created", crate::time::local_time(now as i64, zone)?),
        ("Device", device.into()),
    ] {
        y -= 15.0;
        pen.write(label, 64.0, y, "Helvetica-Bold", 10.0, true);
        pen.write(&value, 120.0, y, "Helvetica", 10.0, false);
    }
    let top = y - 28.0;
    let width = 595.28 - 64.0 * 2.0;
    let inner = width - 20.0 * 2.0;
    for field in ["vaultId", "secretKey", "server"] {
        let value = kit[field].as_str().unwrap_or_default();
        if fonts::printable(value) != value {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Cannot encode recovery kit field",
            ));
        }
    }
    let rows: Vec<_> = [
        (
            "Vault ID",
            kit["vaultId"].as_str().unwrap_or_default(),
            12.0_f64,
        ),
        (
            "Secret key",
            kit["secretKey"].as_str().unwrap_or_default(),
            18.0,
        ),
        ("Server", server, 12.0),
    ]
    .into_iter()
    .map(|(label, value, preferred)| {
        (
            label,
            value,
            preferred.min(inner / (value.chars().count() as f64 * 600.0 * (1.0 / 1000.0)).max(1.0)),
        )
    })
    .collect();
    let height = 20.0 * 2.0 + rows.iter().map(|r| 9.0 + 8.0 + r.2).sum::<f64>() + 18.0 * 2.0;
    pen.content.push_str(&format!("q\n0.55 0.55 0.6 RG\n1 w\n[] 0 d\n1 0 0 1 64 {} cm\n1 0 0 1 0 0 cm\n1 0 0 1 0 0 cm\n0 0 m\n0 {height} l\n{width} {height} l\n{width} 0 l\nh\nS\nQ\n", top - height));
    y = top - 20.0;
    for (label, value, size) in rows {
        y -= 9.0;
        pen.write(&label.to_uppercase(), 84.0, y, "Helvetica-Bold", 9.0, true);
        y -= 8.0 + size;
        pen.write(value, 84.0, y, "Courier", size, false);
        y -= 18.0;
    }
    y = top - height - 28.0;
    let paragraphs = [
        format!(
            "To get back in on a new device: run envden join {server} --recovery, enter the vault ID and secret key above, then your master password."
        ),
        "Keep this offline, like a passport. Never write your master password on it.".into(),
        "Anyone with this kit and your master password can open the vault.".into(),
    ];
    for paragraph in paragraphs {
        let text = fonts::printable(&paragraph);
        let mut line = String::new();
        let mut current_width = 0.0;
        for word in text.split_inclusive(' ') {
            let word_width = fonts::width(word, 11.0);
            if current_width + word_width > width && !line.is_empty() {
                y -= 16.0;
                pen.write(
                    envden_core::text::js_trim(&line),
                    64.0,
                    y,
                    "Helvetica",
                    11.0,
                    false,
                );
                line.clear();
                current_width = 0.0;
            }
            line.push_str(word);
            current_width += word_width;
        }
        if !line.is_empty() {
            y -= 16.0;
            pen.write(
                envden_core::text::js_trim(&line),
                64.0,
                y,
                "Helvetica",
                11.0,
                false,
            );
        }
        y -= 8.0;
    }
    let footer = "https://envden.theclau.de";
    pen.write(
        footer,
        (595.28 - fonts::width(footer, 9.0)) / 2.0,
        64.0,
        "Helvetica",
        9.0,
        true,
    );
    writer::pdf(&pen.content, &pen.resources, now)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_pdf_lib_bytes() {
        for (input, reference) in [
            (
                include_str!("../../../../../../parity/fixtures/recovery-pdf/kit.json"),
                include_bytes!("../../../../../../parity/fixtures/recovery-pdf/kit.pdf").as_slice(),
            ),
            (
                include_str!("../../../../../../parity/fixtures/recovery-pdf/long.json"),
                include_bytes!("../../../../../../parity/fixtures/recovery-pdf/long.pdf")
                    .as_slice(),
            ),
        ] {
            let fixture: Value = serde_json::from_str(input).unwrap();
            let bytes = render_at_zone(
                &fixture["kit"],
                fixture["now"].as_u64().unwrap(),
                fixture["deviceName"].as_str().unwrap(),
                Some("UTC"),
            )
            .unwrap();
            assert_eq!(bytes, reference);
        }
    }
}
