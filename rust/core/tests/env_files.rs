use envden_core::adapters::{IEnvFileRules, accepts_env_path};
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
        assert_eq!(
            accepts_env_path(case["path"].as_str().unwrap(), Some(&rules)),
            case["accepted"].as_bool().unwrap(),
            "{case}"
        );
    }
}
