mod support {
    use envden_core::adapters::IStoredVault;
    pub fn vault(active: bool) -> IStoredVault {
        IStoredVault {
            active,
            ..Default::default()
        }
    }
}
#[path = "support/swap.rs"]
mod swap;
use envden_adapter_storage_sqlite::create_sqlite_storage_adapter;
use envden_core::adapters::*;
use rusqlite::Connection;

#[test]
fn sqlite_storage_classes_match_bun() {
    for ts in [true, false] {
        let dir = tempfile::tempdir().unwrap();
        if ts {
            let output = std::process::Command::new("bun")
                .arg(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/tests/fixtures/bridge.mjs"
                ))
                .arg("write")
                .arg(dir.path())
                .output()
                .unwrap();
            assert!(output.status.success(), "{output:?}");
        } else {
            let db = create_sqlite_storage_adapter(dir.path(), 0).unwrap();
            db.configure_vault(
                &[1],
                &IStoredVault {
                    unlock_period: Some(123),
                    ..support::vault(true)
                },
                &[],
                None,
            )
            .unwrap();
            db.put_device(&[1], &[2], &IStoredDevice::default())
                .unwrap();
            let mut swap = swap::swap(1);
            swap.vault = None;
            db.commit_swap(&[1], None, &swap, 1).unwrap();
            db.close().unwrap();
        }
        let db = Connection::open(dir.path().join("envden.sqlite")).unwrap();
        assert_eq!(
            db.query_row(
                "SELECT typeof(id),typeof(active),typeof(period),typeof(head) FROM vaults",
                [],
                |r| Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?
                ))
            )
            .unwrap(),
            (
                "blob".into(),
                "integer".into(),
                "real".into(),
                "blob".into()
            )
        );
        assert_eq!(
            db.query_row(
                "SELECT typeof(seq),typeof(at),length(seq) FROM headers",
                [],
                |r| Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?
                ))
            )
            .unwrap(),
            ("text".into(), "real".into(), 20)
        );
    }
}
