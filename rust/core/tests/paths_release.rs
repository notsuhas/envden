use envden_core::{paths::*, release::parse_sha256_sums};
#[test]
fn containment_matches_posix_and_windows() {
    for (root, target, expected) in [
        ("/repos", "/repos", TRootPlacement::Root),
        ("/repos", "/repos/", TRootPlacement::Root),
        ("/repos", "/repos/a", TRootPlacement::Inside),
        ("/repos", "/repos/..cache", TRootPlacement::Inside),
        ("/repos", "/repos/a/../b", TRootPlacement::Inside),
        ("/repos", "/", TRootPlacement::Outside),
        ("/repos", "/repos-other", TRootPlacement::Outside),
        ("/repos", "/repos/../x", TRootPlacement::Outside),
    ] {
        assert_eq!(place_in_root(root, target), expected);
    }
    for (target, expected) in [
        (r"C:\repos", TRootPlacement::Root),
        ("c:/repos/a", TRootPlacement::Inside),
        (r"C:\repos\..cache", TRootPlacement::Inside),
        (r"C:\", TRootPlacement::Outside),
        (r"C:\repos\..\x", TRootPlacement::Outside),
        (r"D:\repos\a", TRootPlacement::Outside),
        (r"\\server\share\repos", TRootPlacement::Outside),
    ] {
        assert_eq!(place_in_root_windows(r"C:\repos", target), expected);
    }
}
#[test]
fn sha256sum_entries() {
    let a = "a".repeat(64);
    let b = "B".repeat(64);
    let hashes = parse_sha256_sums(&format!(
        "{a}  envden-linux-x64\r\n{b} *envden-windows-x64.exe\n"
    ))
    .unwrap();
    assert_eq!(hashes["envden-linux-x64"], a);
    assert_eq!(hashes["envden-windows-x64.exe"], b.to_lowercase());
    for invalid in [
        String::new(),
        format!("{}  envden", &a[1..]),
        format!("{}  envden", "g".repeat(64)),
        format!("{a} envden"),
        format!("{a}  envden x"),
    ] {
        assert_eq!(
            parse_sha256_sums(&invalid).unwrap_err().message,
            "Invalid SHA256SUMS entry"
        );
    }
    assert_eq!(
        parse_sha256_sums(&format!("{a}  envden\n{a}  envden"))
            .unwrap_err()
            .message,
        "Duplicate SHA256SUMS entry"
    );
}
#[test]
fn checksums_follow_javascript_whitespace() {
    let hash = "a".repeat(64);
    assert!(parse_sha256_sums(&format!("\u{feff}{hash}  file\u{feff}")).is_ok());
    assert!(parse_sha256_sums(&format!("\u{85}{hash}  file")).is_err());
    assert!(parse_sha256_sums(&format!("{hash}  a\u{85}b")).is_ok());
}
