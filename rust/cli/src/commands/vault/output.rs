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
        path,
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
            let device = state
                .as_ref()
                .and_then(|s| s["deviceName"].as_str())
                .unwrap_or("device");
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
