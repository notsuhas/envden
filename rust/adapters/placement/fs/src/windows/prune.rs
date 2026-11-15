use super::state;
use envden_core::errors::Result;
use std::{fs, path::Path};

pub fn prune_backups(dir: &Path, now: f64, max_age_days: Option<f64>) -> Result<()> {
    let age = max_age_days.unwrap_or(30.0);
    if !now.is_finite() || !age.is_finite() || age < 0.0 {
        return Err(state::invalid("Invalid backup retention"));
    }
    let Some(info) = state::stat(dir)? else {
        return Ok(());
    };
    if !info.is_dir() || info.is_symlink() {
        return Err(state::invalid("Unsafe backup directory"));
    }
    let pattern = regex::Regex::new(r"^\.envden-backup-(\d+)-[0-9a-f-]{36}$").unwrap();
    for entry in fs::read_dir(dir).map_err(state::failure)? {
        let entry = entry.map_err(state::failure)?;
        let name = entry.file_name();
        let text = name.to_string_lossy();
        let Some(m) = pattern.captures(&text) else {
            continue;
        };
        if m[1].parse::<f64>().unwrap_or(f64::INFINITY) >= now - age * 86400000.0 {
            continue;
        }
        if state::stat(&entry.path())?.is_some_and(|s| s.is_file() && !s.is_symlink()) {
            match fs::remove_file(entry.path()) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(state::failure(e)),
            }
        }
    }
    Ok(())
}
