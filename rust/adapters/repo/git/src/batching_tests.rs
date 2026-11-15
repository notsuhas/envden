use crate::{exec, parity::git};
use std::fs;

#[test]
fn discovery_batches_queries_with_one_global_configuration_read() {
    use envden_core::adapters::IRepoAdapter;
    let home = tempfile::tempdir().unwrap();
    let root = home.path();
    git(root, &["init", "-q"]);
    git(
        root,
        &["remote", "add", "origin", "https://github.com/team/repo"],
    );
    let adapter = crate::create_git_repo_adapter(crate::IGitRepoOptions {
        home: Some(root.to_string_lossy().into()),
        ..Default::default()
    });
    let checkout = adapter
        .checkout_at(root.to_str().unwrap())
        .unwrap()
        .unwrap();
    fs::write(root.join(".gitignore"), ".env*\n").unwrap();
    for index in 0..12 {
        fs::write(root.join(format!(".env.{index}")), "A=1").unwrap();
    }
    exec::CALLS.with(|calls| calls.borrow_mut().clear());
    let files = adapter.env_files(&checkout, None).unwrap();
    assert_eq!(files.len(), 12);
    exec::CALLS.with(|calls| {
        let calls = calls.borrow();
        for command in ["ls-files", "check-ignore", "--global"] {
            assert_eq!(
                calls
                    .iter()
                    .filter(|(args, _)| args.iter().any(|s| s == command))
                    .count(),
                1,
                "{command}"
            );
        }
        let configs: std::collections::HashSet<_> = calls
            .iter()
            .filter_map(|(_, path)| path.as_deref())
            .collect();
        assert_eq!(configs.len(), 1);
        let path = configs.into_iter().next().unwrap();
        assert!(fs::metadata(path).unwrap().is_file());
        assert_eq!(fs::read(path).unwrap(), b"");
    });
}
