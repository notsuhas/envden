use super::write_through::write_through;
use crate::state::files::failure;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::{fs, path::Path};

pub fn install_agent(home: &Path, now: u64) -> Result<()> {
    let target = home.join(".agents/skills/envden");
    let link = home.join(".claude/skills/envden");
    let file = target.join("SKILL.md");
    match fs::read_to_string(&file) {
        Ok(text) if !own_skill(&text) => {
            return Err(conflict(
                "~/.agents/skills/envden already holds a different skill",
            ));
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(failure(e)),
        _ => {}
    }
    write_through(&file, include_bytes!("skill.md"), now)?;
    fs::create_dir_all(link.parent().unwrap()).map_err(failure)?;
    match fs::symlink_metadata(&link) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            #[cfg(unix)]
            std::os::unix::fs::symlink(&target, &link).map_err(failure)?;
            #[cfg(windows)]
            std::os::windows::fs::symlink_dir(&target, &link).map_err(failure)?;
        }
        Err(e) => return Err(failure(e)),
        Ok(_) if fs::canonicalize(&link).ok() != fs::canonicalize(&target).ok() => {
            return Err(conflict(
                "~/.claude/skills/envden already holds a different skill",
            ));
        }
        _ => {}
    }
    Ok(())
}

fn own_skill(text: &str) -> bool {
    text.split("\n---")
        .next()
        .unwrap_or("")
        .lines()
        .any(|s| s == "name: envden")
}

fn conflict(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::Conflict, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_refresh_and_refuse_other_skills() {
        let temp = tempfile::tempdir().unwrap();
        install_agent(temp.path(), 10).unwrap();
        install_agent(temp.path(), 11).unwrap();
        let file = temp.path().join(".agents/skills/envden/SKILL.md");
        assert_eq!(fs::read_to_string(&file).unwrap(), include_str!("skill.md"));
        fs::write(&file, "---\nname: different\n---\n").unwrap();
        assert_eq!(
            install_agent(temp.path(), 12).unwrap_err().code,
            ErrorCode::Conflict
        );
    }

    #[test]
    fn name_must_be_in_frontmatter() {
        assert!(!own_skill("---\nname: other\n---\nname: envden\n"));
        assert!(own_skill("---\nname: envden\n---\n"));
    }
}
