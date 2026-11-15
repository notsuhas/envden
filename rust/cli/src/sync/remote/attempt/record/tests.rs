use super::{
    codec::{IAttempt, decode},
    invalid_attempt_state,
};
use crate::client::text;
use sha2::{Digest, Sha256};
use std::fs;

#[test]
fn rejects_tampered_receipts_and_invalid_sequences() {
    let document = r#"{"header":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","sequence":"2","places":[],"entries":[]}"#;
    let receipt = text(&Sha256::digest(document.as_bytes()));
    assert_eq!(decode(document, &receipt).unwrap().sequence, "2");
    assert!(decode(&document.replace('2', "3"), &receipt).is_err());
    let invalid = document.replace("\"2\"", "\"-1\"");
    assert!(decode(&invalid, &text(&Sha256::digest(invalid.as_bytes()))).is_err());
}

#[test]
fn detects_corrupt_attempts_without_changing_records() {
    let valid = serde_json::to_string(&IAttempt {
        header: "A".repeat(43),
        sequence: "2".into(),
        places: vec![],
        entries: vec![],
    })
    .unwrap();
    let invalid_sequence = valid.replace("\"2\"", "\"-1\"");
    let invalid_entry = serde_json::to_string(&IAttempt {
        header: "A".repeat(43),
        sequence: "2".into(),
        places: vec![],
        entries: vec![text(&[0])],
    })
    .unwrap();
    let receipt = |value: &str| text(&Sha256::digest(value.as_bytes()));
    let dir = tempfile::tempdir().unwrap();
    let absent = dir.path().join("absent");
    assert!(!invalid_attempt_state(&absent).unwrap());
    assert!(!absent.exists());

    for (name, contents, expected) in [
        (receipt(&valid), valid.as_str(), false),
        ("A".repeat(43), valid.as_str(), true),
        (receipt("{"), "{", true),
        (receipt(&invalid_sequence), invalid_sequence.as_str(), true),
        (receipt(&invalid_entry), invalid_entry.as_str(), true),
        (format!("{}.invalid", "A".repeat(43)), "marker", true),
        (format!("{}.invalid", "A".repeat(42)), "marker", false),
        (
            format!("{}.invalid.invalid", "A".repeat(43)),
            "marker",
            false,
        ),
        ("!".repeat(43), "ignored", false),
    ] {
        let home = tempfile::tempdir().unwrap();
        let attempts = home.path().join("state/attempts");
        fs::create_dir_all(&attempts).unwrap();
        let path = attempts.join(name);
        fs::write(&path, contents).unwrap();

        assert_eq!(invalid_attempt_state(home.path()).unwrap(), expected);
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
        assert_eq!(fs::read_dir(&attempts).unwrap().count(), 1);
    }

    let home = tempfile::tempdir().unwrap();
    fs::create_dir(home.path().join("state")).unwrap();
    fs::write(home.path().join("state/attempts"), "not a directory").unwrap();
    assert!(!invalid_attempt_state(home.path()).unwrap());
}
