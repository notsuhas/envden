use envden_core::{
    adapters::{
        IEnvFileRules, accepts_env_path, byte_sensitive_env_pattern, unsupported_env_pattern,
    },
    errors::ErrorCode,
};
use serde_json::Value;

#[test]
fn typescript_env_file_rules() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("fixtures/env-files.json")).unwrap();

    for case in cases {
        let patterns = |name: &str| {
            case["options"][name]
                .as_array()
                .map(|v| v.iter().map(|s| s.as_str().unwrap().to_owned()).collect())
        };
        let rules = IEnvFileRules {
            include: patterns("include"),
            exclude: patterns("exclude"),
            extra_skipped: None,
        };
        let path = case["path"].as_str().unwrap();

        match accepts_env_path(path, Some(&rules)) {
            Ok(accepted) => assert_eq!(accepted, case["accepted"].as_bool().unwrap(), "{case}"),
            Err(error) => {
                assert_eq!(error.code, ErrorCode::InvalidInput, "{case}");
                assert!(refusable(&rules, path), "{case}");
            }
        }
    }
}

#[test]
fn patterns_fast_glob_cannot_match_exactly_fail_closed() {
    let ten_wide_groups = format!(".env{}", "{,,,,,,,}".repeat(10));
    let patterns = [
        ".env.[a",
        ".env.{a",
        ".env\\",
        ".env.{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}",
        ten_wide_groups.as_str(),
        "apps/{*,**}",
        "{*,**}/.env",
        "**/a{**,}",
        "*{a}**/**/*",
        "**/{a,b}**/**/*",
        "a*{}**/**/*",
        "*a**/**/*",
        ".env**/**/*",
        ".env**",
        "a[\\n-z]b/.env",
        "!a[\\b-z]b/.env",
        ".env.[\\]]",
        "apps[/]web/.env",
        "apps[!x]web/.env",
        "apps/[^.]*/.env",
        "apps[.-0]web/.env",
        ".env.[é]",
        ".env.[!]",
    ];
    let paths = [
        ".env",
        ".env.local",
        "apps/web/.env",
        "../.env",
        "/etc/.env",
    ];

    for pattern in patterns {
        assert!(unsupported_env_pattern(pattern), "{pattern}");

        for rules in [
            IEnvFileRules {
                include: Some(vec![pattern.into()]),
                ..Default::default()
            },
            IEnvFileRules {
                exclude: Some(vec![pattern.into()]),
                ..Default::default()
            },
        ] {
            for path in paths {
                let error = accepts_env_path(path, Some(&rules)).unwrap_err();

                assert_eq!(error.code, ErrorCode::InvalidInput, "{pattern} {path}");
            }
        }
    }
}

#[test]
fn byte_wildcards_refuse_non_ascii_names_only() {
    let rules = IEnvFileRules {
        include: Some(vec![".env.?".into(), ".env.[a-z]".into()]),
        ..Default::default()
    };

    assert!(accepts_env_path(".env.a", Some(&rules)).unwrap());
    assert!(!accepts_env_path(".env.ab", Some(&rules)).unwrap());
    assert!(accepts_env_path(".env.é", Some(&rules)).is_err());
    assert!(accepts_env_path("é/.env.a", Some(&rules)).unwrap());

    let escaped = IEnvFileRules {
        include: Some(vec![".env.\\[team\\]*".into()]),
        ..Default::default()
    };

    assert!(accepts_env_path(".env.[team]é", Some(&escaped)).unwrap());
}

fn refusable(rules: &IEnvFileRules, path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or_default();

    [&rules.include, &rules.exclude]
        .into_iter()
        .flatten()
        .flatten()
        .any(|pattern| {
            let target = if pattern.contains('/') { path } else { name };

            unsupported_env_pattern(pattern)
                || (byte_sensitive_env_pattern(pattern) && !target.is_ascii())
        })
}
