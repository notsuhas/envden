use super::IEnvFileRules;
use globset::GlobBuilder;
pub fn accepts_env_path(path: &str, options: Option<&IEnvFileRules>) -> bool {
    let empty = IEnvFileRules::default();
    let options = options.unwrap_or(&empty);
    let parts: Vec<_> = path.split('/').collect();
    let name = parts.last().copied().unwrap_or("");
    let skipped = [
        ".git",
        "node_modules",
        ".next",
        "dist",
        "build",
        "out",
        "coverage",
        ".turbo",
        ".cache",
        "vendor",
    ];
    let skip = parts[..parts.len() - 1].iter().any(|part| {
        let lower = part.to_lowercase();
        skipped.contains(&lower.as_str())
            || options
                .extra_skipped
                .as_ref()
                .is_some_and(|v| v.iter().any(|p| p.to_lowercase() == lower))
    });
    let matches = |patterns: &[String]| {
        patterns.iter().any(|p| {
            GlobBuilder::new(p)
                .literal_separator(true)
                .build()
                .is_ok_and(|g| {
                    g.compile_matcher()
                        .is_match(if p.contains('/') { path } else { name })
                })
        })
    };
    !skip
        && name.to_lowercase() != ".envrc"
        && options
            .include
            .as_ref()
            .map(|p| matches(p))
            .unwrap_or_else(|| {
                name == ".env" || name.strip_prefix(".env.").is_some_and(|s| !s.is_empty())
            })
        && !options
            .exclude
            .as_ref()
            .map(|p| matches(p))
            .unwrap_or_else(|| {
                [".example", ".sample", ".template", ".defaults"]
                    .iter()
                    .any(|s| name.ends_with(s))
            })
}
