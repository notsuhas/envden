use super::local::{conflicts::IConflictRecord, files::read_bytes};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    merge::has_conflict_markers,
};
use std::path::{Path, PathBuf};

pub fn resolution_bytes(
    choice: &str,
    record: &IConflictRecord,
    server: Option<Vec<u8>>,
) -> Result<Option<Vec<u8>>> {
    if choice == "take-server" {
        if record.entry.is_none() {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "No server entry; keep mine or edit the local conflict file",
            ));
        }
        return if record.deleted {
            Ok(None)
        } else {
            require_content(server).map(Some)
        };
    }
    if choice == "edit" {
        let edited = read_bytes(Path::new(&record.file))?;
        if edited.is_none() && !record.mine_deleted {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Conflict file is missing; choose a recorded deletion side explicitly",
            ));
        }
        if edited.as_deref().is_some_and(has_conflict_markers) {
            return Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                format!(
                    "Conflict markers are still in {}. Edit it, or pass --keep-mine or --take-server",
                    record.file
                ),
            ));
        }
        return Ok(edited);
    }
    if record.mine_deleted {
        Ok(None)
    } else {
        require_content(read_bytes(Path::new(&record.mine))?).map(Some)
    }
}

pub fn select_conflicts<'a>(
    records: &'a [IConflictRecord],
    repo: Option<&Path>,
    file: Option<&str>,
    cwd: &Path,
) -> Vec<&'a IConflictRecord> {
    let resolve =
        |p: &Path| -> PathBuf { crate::links::takeover::sibling::normalize(&cwd.join(p)) };
    let repo = repo.map(resolve);
    let scoped: Vec<_> = records
        .iter()
        .filter(|r| {
            repo.as_ref()
                .is_none_or(|repo| r.targets.iter().any(|t| Path::new(&t.root) == repo))
        })
        .collect();
    let Some(file) = file.filter(|f| !f.is_empty()) else {
        return scoped;
    };
    let placed: Vec<_> = scoped
        .iter()
        .copied()
        .filter(|r| {
            r.file == file
                || r.targets
                    .iter()
                    .any(|t| resolve(Path::new(file)) == Path::new(&t.root).join(&r.path))
        })
        .collect();
    if !placed.is_empty() {
        placed
    } else {
        scoped.into_iter().filter(|r| r.path == file).collect()
    }
}

fn require_content(bytes: Option<Vec<u8>>) -> Result<Vec<u8>> {
    bytes.ok_or_else(|| {
        EnvdenError::new(
            ErrorCode::InvalidInput,
            "Recorded conflict content is missing",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::local::conflicts::IConflictTarget;

    fn record(root: &Path) -> IConflictRecord {
        IConflictRecord {
            remote: root.join("remote").to_string_lossy().into_owned(),
            alternatives: vec![],
            targets: vec![IConflictTarget {
                root: "/checkout".into(),
                path: ".env".into(),
                store: root.join("store").to_string_lossy().into_owned(),
                mode: "link".into(),
                local_only: None,
            }],
            entry: Some("entry".into()),
            store: root.join("store").to_string_lossy().into_owned(),
            root: "/checkout".into(),
            path: ".env".into(),
            mode: "link".into(),
            base: root.join("base").to_string_lossy().into_owned(),
            file: root.join("conflict").to_string_lossy().into_owned(),
            server: root.join("server").to_string_lossy().into_owned(),
            mine: root.join("mine").to_string_lossy().into_owned(),
            deleted: false,
            mine_deleted: false,
        }
    }

    #[test]
    fn explicit_deletion_and_edit_guards() {
        let dir = tempfile::tempdir().unwrap();
        let mut r = record(dir.path());
        assert_eq!(
            resolution_bytes("edit", &r, None).unwrap_err().message,
            "Conflict file is missing; choose a recorded deletion side explicitly"
        );
        std::fs::write(
            &r.file,
            b"<<<<<<< this device\nA=1\n=======\nA=2\n>>>>>>> server\n",
        )
        .unwrap();
        assert!(
            resolution_bytes("edit", &r, None)
                .unwrap_err()
                .message
                .starts_with("Conflict markers are still in ")
        );
        std::fs::write(&r.file, b"A=3\n").unwrap();
        assert_eq!(
            resolution_bytes("edit", &r, None).unwrap(),
            Some(b"A=3\n".to_vec())
        );
        assert!(resolution_bytes("keep-mine", &r, None).is_err());
        std::fs::write(&r.mine, b"").unwrap();
        assert_eq!(
            resolution_bytes("keep-mine", &r, None).unwrap(),
            Some(vec![])
        );
        r.deleted = true;
        assert_eq!(resolution_bytes("take-server", &r, None).unwrap(), None);
        r.entry = None;
        assert_eq!(
            resolution_bytes("take-server", &r, Some(vec![]))
                .unwrap_err()
                .message,
            "No server entry; keep mine or edit the local conflict file"
        );
        r.mine_deleted = true;
        assert_eq!(resolution_bytes("keep-mine", &r, None).unwrap(), None);
    }

    #[test]
    fn matching_prefers_placed_file_over_bare_name() {
        let dir = tempfile::tempdir().unwrap();
        let first = record(dir.path());
        let mut second = first.clone();
        second.targets[0].root = "/other".into();
        let records = vec![first, second];
        assert_eq!(
            select_conflicts(&records, None, Some("/checkout/.env"), Path::new("/")).len(),
            1
        );
        assert_eq!(
            select_conflicts(&records, None, Some(".env"), Path::new("/outside")).len(),
            2
        );
        assert_eq!(
            select_conflicts(
                &records,
                Some(Path::new("/other")),
                Some(".env"),
                Path::new("/")
            )
            .len(),
            1
        );
    }
}
