use super::*;
#[cfg(test)]
mod cases {
    use super::*;
    #[test]
    fn restores_latest_from_update_cache_without_persisting_it() {
        let temp = tempfile::tempdir().unwrap();
        let mut state = super::super::super::empty_state("test");
        state["latest"] = "0.0.1".into();
        save_state(temp.path(), &state, 42).unwrap();
        crate::updates::cache::save_update_cache(
            temp.path(),
            &crate::updates::cache::IUpdateCache {
                latest: Some("1.2.3".into()),
                ..Default::default()
            },
            42,
        )
        .unwrap();
        let restored = load_state(temp.path()).unwrap().unwrap();
        assert_eq!(restored["latest"], "1.2.3");
        let saved: Value =
            serde_json::from_slice(&std::fs::read(temp.path().join("state/device.json")).unwrap())
                .unwrap();
        assert!(saved.get("latest").is_none());
    }

    #[test]
    fn roundtrip_and_header_integrity() {
        let temp = tempfile::tempdir().unwrap();
        let mut state = super::super::super::empty_state("test");
        state["headers"] = serde_json::json!(["one", "two", "one"]);
        save_state(temp.path(), &state, 123).unwrap();
        assert_eq!(load_state(temp.path()).unwrap(), Some(state));
        let hash = format!("{:x}", Sha256::digest(b"one"));
        std::fs::write(temp.path().join("state/headers").join(hash), "changed").unwrap();
        assert_eq!(
            load_state(temp.path()).unwrap_err().message,
            "Unreadable local state"
        );
    }
    #[test]
    fn strict_format() {
        let temp = tempfile::tempdir().unwrap();
        assert!(load_state(temp.path()).unwrap().is_none());
        atomic_write(&temp.path().join("state/device.json"), b"{}", 0).unwrap();
        assert!(load_state(temp.path()).is_err());
        let mut state = super::super::super::empty_state("test");
        state["format"] = serde_json::json!(1.0);
        save_state(temp.path(), &state, 42).unwrap();
        assert!(load_state(temp.path()).unwrap().is_some());
    }
}

#[cfg(test)]
mod header_error_tests {
    use super::*;
    use std::error::Error;

    #[test]
    fn header_restore_preserves_specific_causes() {
        for (reference, expected) in [
            ("invalid".to_owned(), "Invalid header reference"),
            ("0".repeat(64), "Missing stored header"),
        ] {
            let dir = tempfile::tempdir().unwrap();
            save_state(dir.path(), &super::super::super::empty_state("test"), 42).unwrap();
            let path = dir.path().join("state/device.json");
            let mut record: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            record["headerRefs"] = serde_json::json!([reference]);
            std::fs::write(path, record.to_string()).unwrap();
            let error = load_state(dir.path()).unwrap_err();
            assert_eq!(error.source().unwrap().to_string(), expected);
        }
    }
}

#[cfg(test)]
mod collection_tests {
    use super::*;

    #[test]
    fn load_revives_collections_before_validating_state() {
        let dir = tempfile::tempdir().unwrap();
        save_state(dir.path(), &super::super::super::empty_state("test"), 42).unwrap();
        let path = dir.path().join("state/device.json");
        let original: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        for tag in [
            serde_json::json!({"$map":[1]}),
            serde_json::json!({"$bigint":"no"}),
        ] {
            let mut record = original.clone();
            record["keyring"] = tag;
            std::fs::write(&path, record.to_string()).unwrap();
            assert!(load_state(dir.path()).is_err());
        }
        let mut record = original;
        record["keyring"] = serde_json::json!({"$set":["a","a","b"], "ignored":true});
        std::fs::write(&path, record.to_string()).unwrap();
        assert_eq!(
            load_state(dir.path()).unwrap().unwrap()["keyring"],
            serde_json::json!({"$set":["a","b"]})
        );
    }
}
