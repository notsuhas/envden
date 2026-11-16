use envden_core::{
    adapters::{IEnvFileRules, accepts_env_path, unsupported_env_pattern},
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
                assert!(refusable(&rules), "{case}");
            }
        }
    }
}

#[test]
fn patterns_fast_glob_cannot_match_exactly_fail_closed() {
    let ten_wide_groups = format!(".env{}", "{,,,,,,,}".repeat(10));
    let wide_alternatives = format!(".env.{{{}}}", vec!["a"; 17].join(","));
    let long_pattern = format!(".env.{}", "a".repeat(1020));
    let patterns = [
        ".env.[a",
        ".env.{a",
        ".env\\",
        ".env.{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}{a,b}",
        ten_wide_groups.as_str(),
        wide_alternatives.as_str(),
        long_pattern.as_str(),
        ".env.{[],a]}",
        ".env.{[]{a]}",
        ".env.{[ab],c}",
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
fn single_character_wildcards_match_one_code_point() {
    let rules = IEnvFileRules {
        include: Some(vec![".env.?".into(), "?/x/.env".into()]),
        ..Default::default()
    };

    for (path, expected) in [
        (".env.a", true),
        (".env.ab", false),
        (".env.é", true),
        (".env.😀", true),
        (".env.e\u{301}", false),
        (".env.éé", false),
        ("é/x/.env", true),
        ("éé/x/.env", false),
    ] {
        assert_eq!(
            accepts_env_path(path, Some(&rules)).unwrap(),
            expected,
            "{path}"
        );
    }
}

fn refusable(rules: &IEnvFileRules) -> bool {
    [&rules.include, &rules.exclude]
        .into_iter()
        .flatten()
        .flatten()
        .any(|pattern| unsupported_env_pattern(pattern))
}
