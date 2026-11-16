use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::IStorageAdapter;
use rusqlite::Connection;

#[test]
fn close_checkpoints_and_leaves_only_the_database_file() {
    let directory = tempfile::tempdir().unwrap();
    let storage = create_sqlite_storage_adapter(directory.path(), 0).unwrap();
    storage.set_setup_token(&[7; 32]).unwrap();

    storage.close().unwrap();
    storage.close().unwrap();

    let mut names: Vec<_> = std::fs::read_dir(directory.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name.starts_with("envden.sqlite"))
        .collect();
    names.sort();
    assert_eq!(names, ["envden.sqlite"]);

    let db = Connection::open(directory.path().join("envden.sqlite")).unwrap();
    assert_eq!(
        db.query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "wal"
    );
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM setup", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}
