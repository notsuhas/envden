use super::fail;
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use rusqlite::Connection;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::UNIX_EPOCH,
};

pub(crate) use envden_core::process::restrict_access as restrict;

pub(crate) fn sync_dir(path: &Path) -> Result<()> {
    #[cfg(not(windows))]
    fs::File::open(path)
        .and_then(|f| f.sync_all())
        .map_err(fail)?;
    Ok(())
}
pub(crate) fn open_database(dir: &Path, now: u64) -> Result<Connection> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir).map_err(fail)?;
    restrict(dir, true)?;
    for name in [
        "envden.sqlite",
        "envden.sqlite-wal",
        "envden.sqlite-shm",
        "identity.json",
    ] {
        let path = dir.join(name);
        if path.exists() {
            restrict(&path, false)?;
        }
    }
    let path = dir.join("envden.sqlite");
    let existed = path.exists();
    let db = Connection::open(path).map_err(fail)?;
    db.execute_batch("PRAGMA journal_size_limit = 32768; PRAGMA secure_delete = FAST; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;").map_err(fail)?;
    for name in ["envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm"] {
        let path = dir.join(name);
        if path.exists() {
            restrict(&path, false)?;
        }
    }
    db.execute_batch("BEGIN IMMEDIATE").map_err(fail)?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(fail)?;
    if version != 0 && version != 1 {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Incompatible server database format",
        ));
    }
    if version == 0 {
        if existed {
            let bytes = db.serialize("main").map_err(fail)?;
            let mut options = OpenOptions::new();
            options.write(true).create(true).truncate(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(dir.join("pre-1")).map_err(fail)?;
            file.write_all(&bytes).map_err(fail)?;
            file.sync_all().map_err(fail)?;
            sync_dir(dir)?;
        }
        db.execute_batch(include_str!("v1.sql")).map_err(fail)?;
    }
    db.execute_batch("COMMIT").map_err(fail)?;
    prune_backups(dir, now)?;
    Ok(db)
}
pub(crate) fn prune_backups(dir: &Path, now: u64) -> Result<()> {
    for entry in fs::read_dir(dir).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name
            .strip_prefix("pre-")
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
        {
            let modified = entry.metadata().and_then(|m| m.modified()).map_err(fail)?;
            let age = modified
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as i128)
                .unwrap_or_else(|e| -(e.duration().as_millis() as i128));
            if now as i128 - age >= 30 * 86400000 {
                fs::remove_file(entry.path()).map_err(fail)?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn connection_pragmas_match_typescript() {
        let dir = tempfile::tempdir().unwrap();
        let db = super::open_database(dir.path(), 0).unwrap();
        let expected: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(include_str!("../../tests/fixtures/pragmas.json")).unwrap();
        for (name, expected) in expected {
            let actual = db
                .query_row(&format!("PRAGMA {name}"), [], |r| {
                    Ok(match r.get_ref(0)? {
                        rusqlite::types::ValueRef::Integer(v) => serde_json::json!(v),
                        rusqlite::types::ValueRef::Text(v) => {
                            serde_json::json!(std::str::from_utf8(v).unwrap())
                        }
                        _ => panic!("Unexpected pragma type"),
                    })
                })
                .unwrap();
            assert_eq!(actual, expected, "{name}");
        }
    }
}
