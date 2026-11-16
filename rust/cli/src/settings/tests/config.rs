use crate::settings::{parse_config, read_config, set_config};
use envden_core::errors::ErrorCode;
use serde_json::json;
use std::fs;

#[test]
fn reads_config_with_utf8_replacement() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("config.json"),
        b"{\"placement\":{\"bad\xff\":\"copy\"}}",
    )
    .unwrap();
    assert_eq!(
        read_config(temp.path()).unwrap()["placement"]["bad\u{fffd}"],
        "copy"
    );
}

#[test]
fn refuses_env_file_patterns_it_cannot_match_exactly() {
    let temp = tempfile::tempdir().unwrap();
    let rules = r#"{"include":[".env*"],"exclude":["apps[/]web/.env"]}"#;
    let error = set_config("env-files", rules, temp.path(), &|| 1, true).unwrap_err();

    assert_eq!(
        (error.code, error.message.as_ref()),
        (ErrorCode::InvalidInput, "Unsupported env file pattern")
    );
    assert!(!temp.path().join("config.json").exists());

    fs::write(
        temp.path().join("config.json"),
        r#"{"env-files":{"include":["apps/{*,**}"]}}"#,
    )
    .unwrap();

    assert_eq!(
        read_config(temp.path()).unwrap_err().message,
        "Unsupported env file pattern"
    );
    assert!(parse_config(json!({"env-files":{"extraSkipped":["[a"]}})).is_ok());

    for config in [
        json!({"unknown":true,"env-files":{"include":["["]}}),
        json!({"env-files":{"include":["["]},"telemetry":"bad"}),
    ] {
        assert_eq!(parse_config(config).unwrap_err().message, "Invalid config");
    }
}

#[test]
fn strict_defaults_and_private_save() {
    let temp = tempfile::tempdir().unwrap();
    assert!(
        !read_config(temp.path()).unwrap()["telemetry"]
            .as_bool()
            .unwrap()
    );
    assert!(parse_config(json!({"unknown":true})).is_err());
    set_config("telemetry", "on", temp.path(), &|| 1, false).unwrap();
    assert_eq!(read_config(temp.path()).unwrap()["telemetry"], true);
    assert!(set_config("agent-merge", "on", temp.path(), &|| 1, false).is_err());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(temp.path().join("config.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
