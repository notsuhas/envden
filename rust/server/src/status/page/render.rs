use super::{format_bytes, format_uptime, format_when};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::Value;
use sha2::{Digest, Sha256};

const STYLE: &str = include_str!("style.txt");

pub(crate) fn status_headers() -> Vec<(&'static str, String)> {
    vec![
        (
            "content-security-policy",
            format!(
                "default-src 'none'; style-src 'sha256-{}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
                STANDARD.encode(Sha256::digest(STYLE.as_bytes()))
            ),
        ),
        ("x-content-type-options", "nosniff".into()),
        ("x-frame-options", "DENY".into()),
        ("referrer-policy", "no-referrer".into()),
        ("cache-control", "no-store".into()),
    ]
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn row(label: &str, value: &str, alarm: bool) -> String {
    format!(
        "<dt>{label}</dt><dd{}>{}</dd>",
        if alarm { " class=\"alarm\"" } else { "" },
        escape(value)
    )
}

pub(crate) fn render_status_page(status: &Value, now: u64) -> String {
    let mode = status["mode"].as_str().unwrap_or("normal");
    let mode_text = match mode {
        "restored" => "Restored from backup, accepting repairs only",
        "moved" => "Moved to another server, read-only",
        _ => "Normal",
    };
    let mut rows = vec![
        row("Version", status["version"].as_str().unwrap_or(""), false),
        row(
            "Uptime",
            &format_uptime(status["uptimeSeconds"].as_u64().unwrap_or(0)),
            false,
        ),
        row("Mode", mode_text, mode != "normal"),
        row("Vaults", &status["vaults"].to_string(), false),
        row(
            "Storage",
            &format_bytes(status["storageBytes"].as_u64().unwrap_or(0)),
            false,
        ),
    ];
    if let Some(band) = status["fullestVault"].as_str() {
        let label = match band {
            "50-80" => "50–80% of quota",
            "80-95" => "80–95% of quota",
            "95-plus" => "95% of quota or more",
            _ => "under 50% of quota",
        };
        rows.push(row("Fullest vault", label, band == "95-plus"));
    }
    let prune = &status["lastPrune"];
    let prune_text = prune["at"].as_str().map_or_else(
        || "not yet".into(),
        |at| {
            format!(
                "{}, {}",
                format_when(at, now),
                if prune["ok"] == true {
                    "succeeded"
                } else {
                    "failed"
                }
            )
        },
    );
    rows.push(row("Last prune", &prune_text, prune["ok"] == false));

    format!(
        r#"<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>envden server</title>
        <style>{STYLE}</style>
      </head>
      <body>
        <main>
          <h1><span>envden</span> server</h1>
          <dl>{}</dl>
          <p>Per-vault details are only in <code>envden ui</code> on a member device.</p>
        </main>
      </body>
    </html> "#,
        rows.join("")
    )
}
