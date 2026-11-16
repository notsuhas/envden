use crate::{
    adapters::IAdapters,
    output::{print, sanitize_console},
    state::repository::load_state,
    vault::recovery::{
        pdf::{print_kit, report_kit},
        write_kit,
    },
};
use envden_core::errors::Result;
use serde_json::Value;
use std::path::Path;

pub struct IReplacementOutput<'a> {
    adapters: &'a IAdapters,
    path: Option<&'a str>,
    shown: bool,
}

pub fn replacement_output<'a>(
    adapters: &'a IAdapters,
    path: Option<&'a str>,
) -> IReplacementOutput<'a> {
    IReplacementOutput {
        adapters,
        path: path.filter(|value| !value.is_empty()),
        shown: false,
    }
}

impl IReplacementOutput<'_> {
    pub fn show(&mut self, kit: &Value) -> Result<()> {
        if let Some(path) = self.path {
            if write_kit(Path::new(path), kit).is_ok() {
                print(&sanitize_console(&format!("Recovery kit saved to {path}")));
            } else {
                eprintln!("envden: Could not save the recovery kit; save the kit printed below");
                print_kit(kit);
            }
        } else {
            let state = load_state(&self.adapters.home)?;
            let device = device_name(state.as_ref(), &self.adapters.hostname);
            report_kit(kit, &self.adapters.user_home, device, (self.adapters.now)())?;
        }
        self.shown = true;
        Ok(())
    }
    pub fn fail(&self) {
        if self.shown {
            eprintln!(
                "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish."
            );
        }
    }
}

fn device_name<'a>(state: Option<&'a Value>, hostname: &'a str) -> &'a str {
    state
        .and_then(|s| s["deviceName"].as_str())
        .unwrap_or(hostname)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_state_uses_hostname_for_the_replacement_kit() {
        assert_eq!(device_name(None, "laptop"), "laptop");
        assert_eq!(
            device_name(Some(&serde_json::json!({"deviceName":""})), "laptop"),
            ""
        );
    }

    #[test]
    fn empty_output_path_uses_pdf_reporting() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        assert!(replacement_output(&adapters, Some("")).path.is_none());
    }
}
