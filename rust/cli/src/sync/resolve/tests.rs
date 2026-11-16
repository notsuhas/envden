use super::*;
use crate::sync::local::conflicts::record::{IConflictSeed, IConflictSides, record_conflict};
use std::fs;

#[cfg(unix)]
#[test]
fn resolve_unlinks_conflict_and_marker_symlinks_without_reading_them() {
    for cleanup in ["file", "pending", "corrupt"] {
        let dir = tempfile::tempdir().unwrap();
        let a = crate::adapters::create_adapters(
            Some(dir.path().join("home")),
            dir.path().into(),
            || 42,
        );
        save_state(&a.home, &crate::state::empty_state("test"), &|| 42).unwrap();
        let store = a.home.join("store/file");
        let base = base_path(&a.home, store.to_str().unwrap(), None);
        record_conflict(
            &a.home,
            IConflictSeed {
                cwd: None,
                entry: None,
                store: store.to_string_lossy().into_owned(),
                root: dir.path().to_string_lossy().into_owned(),
                path: ".env".into(),
                mode: "copy".into(),
                base: base.to_string_lossy().into_owned(),
                targets: vec![],
            },
            &IConflictSides {
                mine: Some(b"A=mine\n"),
                server: None,
                previous: None,
                tombstone: false,
            },
            &[],
            None,
            42,
        )
        .unwrap();
        let record = conflict_records(&a.home).unwrap().remove(0);
        let path = match cleanup {
            "file" => std::path::PathBuf::from(&record.file),
            "pending" => suffix(&base, ".pending"),
            _ => suffix(&base, ".corrupt"),
        };
        let target = dir.path().join("untouched");
        fs::write(&target, b"untouched").unwrap();
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(&target, &path).unwrap();
        resolve_conflict(&a, Some(&record.file), None, "keep-mine", dir.path()).unwrap();
        assert!(fs::symlink_metadata(&path).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"untouched");
        assert_eq!(fs::read(&store).unwrap(), b"A=mine\n");
        assert!(conflict_records(&a.home).unwrap().is_empty());
    }
}
