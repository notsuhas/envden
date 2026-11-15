pub fn project_folder(names: &[String]) -> bool {
    names.iter().any(|n| {
        [
            ".git",
            "package.json",
            "Cargo.toml",
            "go.mod",
            "pom.xml",
            "build.gradle",
            "build.gradle.kts",
            "pyproject.toml",
            "composer.json",
            "Gemfile",
            "Package.swift",
            "CMakeLists.txt",
            "Makefile",
        ]
        .contains(&n.as_str())
    })
}

pub fn skipped_folder(name: &str, home: bool, project: bool) -> bool {
    name.starts_with('.')
        || [
            "node_modules",
            "bower_components",
            "Pods",
            "Carthage",
            "DerivedData",
            "venv",
            "__pycache__",
        ]
        .contains(&name)
        || (home
            && [
                "Library",
                "Applications",
                "Pictures",
                "Music",
                "Movies",
                "AppData",
                "snap",
                "go",
                "miniconda3",
                "anaconda3",
            ]
            .contains(&name))
        || (project && ["target", "build", "dist", "vendor", "third_party"].contains(&name))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scope_sensitive_skips() {
        for name in [".cache", "node_modules", "Pods"] {
            assert!(skipped_folder(name, false, false));
        }
        assert!(skipped_folder("go", true, false));
        assert!(!skipped_folder("go", false, true));
        assert!(skipped_folder("target", false, true));
        assert!(!skipped_folder("target", true, false));
        assert!(project_folder(&["Cargo.toml".into()]));
        assert!(!project_folder(&["readme.md".into()]));
    }
}
