use envden_core::errors::ErrorCode;
use envden_protocol::protocol::*;
use std::cmp::Ordering;

#[test]
fn integer_slices_sizes_lists_and_utf8_match_typescript() {
    let bytes = [99, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 42];
    assert_eq!(Reader::new(&bytes[1..5]).u32().unwrap(), 0x01020304);
    assert_eq!(Reader::new(&bytes[5..]).u64().unwrap(), 42);
    assert_eq!(
        Reader::new(&u64::MAX.to_be_bytes()).u64().unwrap(),
        u64::MAX
    );
    let mut out = Vec::new();
    for limit in [65536, 2097152] {
        let data = vec![0; limit + 1];
        assert_eq!(
            sized(&data, limit, &mut out).unwrap_err().code,
            ErrorCode::InvalidData
        );
        let bytes = [(data.len() as u32).to_be_bytes().as_slice(), &data].concat();
        assert_eq!(
            Reader::new(&bytes).sized(limit).unwrap_err().code,
            ErrorCode::InvalidData
        );
    }
    assert_eq!(
        Reader::new(&[0, 0, 0, 2, 1]).sized(65536).unwrap_err().code,
        ErrorCode::InvalidData
    );
    let mut reader = Reader::new(&[0, 1, 134, 161]);
    assert_eq!(
        reader.list::<u8>().unwrap_err().code,
        ErrorCode::InvalidData
    );
    assert_eq!(reader.offset, 4);
    assert_eq!(
        list(&vec![0u8; 100001], &mut out).unwrap_err().code,
        ErrorCode::InvalidData
    );
    for data in [
        b"\n".as_slice(),
        b"\0",
        "\u{85}".as_bytes(),
        "e\u{301}".as_bytes(),
        &[255],
        &[0xc0, 0x80],
        &[0xed, 0xa0, 0x80],
        &[0xe2],
    ] {
        let bytes = [(data.len() as u32).to_be_bytes().as_slice(), data].concat();
        assert_eq!(
            decode::<String>(&bytes).unwrap_err().code,
            ErrorCode::InvalidData
        );
    }
    assert_eq!(pad(&[0; 256]).len(), 256);
    for text in ["000000", "0!", "OO", "ſ0"] {
        assert!(unbase32(text).is_err());
    }
    assert!(normalize_pairing_code("1-ſ000-0000").is_err());
}

#[test]
fn semver_rejects_each_noncanonical_component() {
    assert_eq!(
        compare_semver("1.10.0", "1.2.0").unwrap(),
        Ordering::Greater
    );
    assert_eq!(parse_semver("0.0.0").unwrap(), ["0", "0", "0"]);
    assert_eq!(
        compare_semver("18446744073709551616.0.0", "18446744073709551615.0.0").unwrap(),
        Ordering::Greater
    );
    for value in [
        "1.2",
        "v1.2.3",
        "1.2.3-a",
        "1.2.3+build",
        "-1.2.3",
        "01.2.3",
        "1.02.3",
        "1.2.03",
    ] {
        assert_eq!(
            parse_semver(value).unwrap_err().code,
            ErrorCode::InvalidData
        );
    }
}

#[test]
fn portable_file_identity_checks_every_reference_path() {
    for path in [
        "",
        "/a",
        "a/",
        "../../__tests__/a",
        "/root",
        "a//b",
        "a/./b",
        "a/../b",
        "C:secret",
        "a:x",
        "a\\b",
        "a./b",
        "a /b",
        "CON",
        "nul.env",
        "dir/COM1.txt",
        "LPT9",
        "a\u{1}b",
        "a\u{85}b",
        "e\u{301}",
    ] {
        assert!(file_id(&[1; 32], "repo", path).is_err(), "{path:?}");
    }
    assert_ne!(
        file_id(&[1; 32], "repo", "A").unwrap(),
        file_id(&[1; 32], "repo", "a").unwrap()
    );
    for path in ["folder/.env", "é/.env", "console.env", "COM10.env"] {
        assert!(validate_path(path).is_ok());
    }
}
