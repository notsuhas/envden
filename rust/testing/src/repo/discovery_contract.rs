use super::contract::IRepoFixture;
use crate::fixtures::with_directory;
use envden_core::adapters::*;
use std::{fs, path::Path};
pub(super) fn discovery_contract(factory: &impl Fn(&str) -> IRepoFixture) {
    with_directory(|dir| {
        let IRepoFixture { repo, root, .. } = factory(dir.to_str().unwrap());
        let checkout = repo.checkout_at(&root).unwrap().unwrap();
        let root = Path::new(&root);
        fs::create_dir(root.join("generated")).unwrap();
        fs::write(root.join(".gitignore"), ".env*\nsecrets.conf\n").unwrap();
        for p in [
            ".env",
            ".env.local",
            "secrets.conf",
            ".envrc",
            "generated/.env",
        ] {
            fs::write(root.join(p), "A=1\n").unwrap();
        }
        assert_eq!(
            repo.env_files(
                &checkout,
                Some(&IEnvFileRules {
                    include: Some(vec!["secrets.*".into(), ".envrc".into()]),
                    ..Default::default()
                })
            )
            .unwrap(),
            ["secrets.conf"]
        );
        assert_eq!(
            repo.env_files(
                &checkout,
                Some(&IEnvFileRules {
                    exclude: Some(vec!["*.local".into()]),
                    ..Default::default()
                })
            )
            .unwrap(),
            [".env", "generated/.env"]
        );
        assert_eq!(
            repo.env_files(
                &checkout,
                Some(&IEnvFileRules {
                    extra_skipped: Some(vec!["generated".into()]),
                    ..Default::default()
                })
            )
            .unwrap(),
            [".env", ".env.local"]
        );
    });
    with_directory(|dir| {
        let IRepoFixture { repo, root, .. } = factory(dir.to_str().unwrap());
        let checkout = repo.checkout_at(&root).unwrap().unwrap();
        let root = Path::new(&root);
        fs::create_dir(root.join("(auth)")).unwrap();
        fs::write(root.join(".gitignore"), ".env\n").unwrap();
        fs::write(root.join("(auth)/.env"), "A=1").unwrap();
        repo.ensure_ignored(&checkout, "(auth)/.env").unwrap();
        assert_eq!(repo.env_files(&checkout, None).unwrap(), ["(auth)/.env"]);
        fs::write(root.join("CaseProbe"), "").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            let original = fs::symlink_metadata(root.join("CaseProbe")).unwrap();
            let alternate = fs::symlink_metadata(root.join("CASEPROBE")).ok();
            assert_eq!(
                repo.case_insensitive(root.to_str().unwrap(), false)
                    .unwrap(),
                alternate.is_some_and(|a| a.ino() == original.ino() && a.dev() == original.dev())
            );
        }
    });
    with_directory(|dir| {
        let IRepoFixture { repo, root, .. } = factory(dir.to_str().unwrap());
        let checkout = repo.checkout_at(&root).unwrap().unwrap();
        let root = Path::new(&root);
        fs::write(root.join(".gitignore"), ".env\n").unwrap();
        fs::write(root.join(".env"), "A=1").unwrap();
        let names = if cfg!(windows) {
            vec![]
        } else {
            vec!["aux", "a:b", "trail "]
        };
        for name in names.iter().copied().chain(["unreadable"]) {
            fs::create_dir(root.join(name)).unwrap();
            fs::write(root.join(name).join(".env"), "A=1").unwrap();
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(root.join("unreadable"), fs::Permissions::from_mode(0o0)).unwrap();
        }
        let files = repo.env_files(&checkout, None);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(root.join("unreadable"), fs::Permissions::from_mode(0o700))
                .unwrap();
        }
        let files = files.unwrap();
        assert!(files.contains(&".env".into()));
        for name in names {
            assert!(!files.contains(&format!("{name}/.env")));
        }
    });
}
