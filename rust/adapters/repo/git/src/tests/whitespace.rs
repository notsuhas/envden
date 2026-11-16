use crate::remote::resolve_host_with;

#[test]
fn git_and_ssh_outputs_use_javascript_whitespace() {
    let home = tempfile::tempdir().unwrap();
    for (suffix, expected) in [("\u{feff}\n", "/repo"), ("\u{85}\n", "/repo\u{85}")] {
        assert_eq!(
            crate::checkout::root_with(home.path().to_str().unwrap(), |_, _| Ok(format!(
                "/repo{suffix}"
            )))
            .unwrap()
            .as_deref(),
            Some(expected)
        );
    }
    for (output, expected) in [
        ("hostname \u{feff}github.com\u{feff}\n", "github.com"),
        (
            "hostname \u{85}github.com\u{85}\n",
            "\u{85}github.com\u{85}",
        ),
    ] {
        assert_eq!(
            resolve_host_with("work", |_, _| Ok(output.into())).unwrap(),
            expected
        );
    }
}
