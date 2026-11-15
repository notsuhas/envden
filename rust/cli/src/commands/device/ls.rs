use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    output::{print, sanitize_console, terminal_json},
    program::IInvocation,
    vault::admin::devices,
};
use envden_core::errors::Result;
use serde_json::Value;
use std::rc::Rc;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let devices = devices::list(adapters, Rc::new(UreqTransport))?;
    print(
        &if invocation.options.get("json") == Some(&Value::Bool(true)) {
            terminal_json(&serde_json::json!(devices))
        } else {
            device_list_text(
                &devices,
                invocation.options.get("verbose") == Some(&Value::Bool(true)),
            )
        },
    );
    Ok(())
}

fn device_list_text(devices: &[Value], verbose: bool) -> String {
    if devices.is_empty() {
        return "No devices".into();
    }
    let width = devices
        .iter()
        .map(|d| {
            d["name"]
                .as_str()
                .unwrap_or_default()
                .encode_utf16()
                .count()
        })
        .max()
        .unwrap_or(0);
    let lines: Vec<_> = devices
        .iter()
        .map(|device| {
            let current = device["current"] == true;
            let mut details = Vec::new();
            if current {
                details.push("this device".into());
            }
            details.push(if device["unconfirmed"] == true {
                "not confirmed yet".into()
            } else if let Some(version) = device["clientVersion"].as_str().filter(|v| !v.is_empty())
            {
                format!("v{version}")
            } else {
                "version unknown".into()
            });
            if device["recoveryKeyHeld"] == true {
                details.push("has held the recovery keys".into());
            }
            if verbose {
                details.push(format!("id {}", device["id"].as_str().unwrap_or_default()));
            }
            let name = device["name"].as_str().unwrap_or_default();
            envden_core::text::js_trim_end(&format!(
                "{} {name}{}  {}",
                if current { "*" } else { " " },
                " ".repeat(width - name.encode_utf16().count()),
                details.join(" · ")
            ))
            .to_owned()
        })
        .collect();
    sanitize_console(&lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn list_output() {
        assert_eq!(device_list_text(&[], false), "No devices");
        assert_eq!(
            device_list_text(
                &[
                    json!({"name":"one","current":true,"unconfirmed":false,"clientVersion":"1.2.3","recoveryKeyHeld":true,"id":"ABC"})
                ],
                true
            ),
            "* one  this device · v1.2.3 · has held the recovery keys · id ABC"
        );
    }
}
