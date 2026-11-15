use super::{kit_folder, render_kit, write_kit_pdf};
use crate::output::{home_path, print, prompts::consent};
use envden_core::errors::Result;
use serde_json::Value;
use std::{
    io::{self, IsTerminal},
    path::Path,
};

pub fn print_kit(kit: &Value) {
    print(&crate::output::sanitize_console(&format!(
        "Recovery kit\nKeep it somewhere safe and offline, like a passport. With your master password it opens the vault if you lose every device, so never write the password on it.\n\n  Vault ID:    {}\n  Secret key:  {}\n  Server:      {}",
        kit["vaultId"].as_str().unwrap_or_default(),
        kit["secretKey"].as_str().unwrap_or_default(),
        kit["server"].as_str().unwrap_or_default()
    )));
}

pub fn report_kit(kit: &Value, user_home: &Path, device: &str, now: u64) -> Result<()> {
    let saved = render_kit(kit, now, device).and_then(|bytes| {
        write_kit_pdf(
            &kit_folder(user_home),
            kit["vaultId"].as_str().unwrap_or_default(),
            &bytes,
        )
    });
    let Ok(path) = saved else {
        eprintln!("envden: Couldn't write the recovery kit file; save the kit printed below");
        print_kit(kit);
        while io::stdin().is_terminal() && !consent("Saved the recovery kit?", false)? {}
        return Ok(());
    };
    print(&crate::output::sanitize_console(&format!(
        "Recovery kit saved to {}\nPrint it or store it offline, then delete the file from this computer.",
        home_path(&path, user_home)
    )));
    if io::stdin().is_terminal()
        && consent("Open it now?", true)?
        && !crate::ui::browser::open_browser(&path.to_string_lossy())
    {
        eprintln!("envden: Couldn't open the kit; open the file above yourself");
    }
    Ok(())
}
