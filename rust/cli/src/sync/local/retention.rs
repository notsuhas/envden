use envden_core::errors::Result;
use std::{fs, path::Path};

pub fn prune_backups(home: &Path, now: u64) -> Result<()> {
    for (directory, recursive) in [
        ("state", true),
        ("base", true),
        ("conflicts/backups", false),
    ] {
        prune(&home.join(directory), now, recursive)?;
    }
    Ok(())
}

fn prune(directory: &Path, now: u64, recursive: bool) -> Result<()> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(crate::state::files::failure(e)),
    };
    let pattern=regex::Regex::new(r"(?:\.corrupt-|^\.?)(\d{13})_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\.tmp)?$").unwrap();
    for entry in entries {
        let entry = entry.map_err(crate::state::files::failure)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".lock") {
            continue;
        }
        let expired = pattern
            .captures(&name)
            .and_then(|c| c[1].parse::<u64>().ok())
            .is_some_and(|at| now.saturating_sub(at) >= 30 * 86400 * 1000);
        let directory = entry
            .file_type()
            .map_err(crate::state::files::failure)?
            .is_dir();
        if expired {
            if directory {
                fs::remove_dir_all(entry.path())
            } else {
                fs::remove_file(entry.path())
            }
            .map_err(crate::state::files::failure)?;
        } else if recursive && directory {
            prune(&entry.path(), now, true)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nested_expired_temps_are_removed_but_active_records_remain() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("state/attempts");
        fs::create_dir_all(&nested).unwrap();
        let expired = nested.join(".0000000000001_12345678-1234-1234-1234-123456789abc.tmp");
        fs::write(&expired, b"old").unwrap();
        fs::write(nested.join("file.corrupt"), b"keep").unwrap();
        prune_backups(dir.path(), 30 * 86400 * 1000 + 1).unwrap();
        assert!(!expired.exists());
        assert!(nested.join("file.corrupt").exists());
    }
}
