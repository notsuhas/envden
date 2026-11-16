use crate::fixtures::with_directory;
use envden_core::{adapters::*, filesystem::ICanonicalPath};
use std::fs;
pub struct IRepoFixture {
    pub repo: Box<dyn IRepoAdapter>,
    pub root: String,
    pub outside: String,
}
pub fn repo_contract(factory: impl Fn(&str) -> IRepoFixture) {
    super::discovery_contract::discovery_contract(&factory);
    with_directory(|dir| {
        let IRepoFixture {
            repo,
            root,
            outside,
        } = factory(dir.to_str().unwrap());
        let nested = std::path::Path::new(&root).join("nested");
        fs::create_dir(&nested).unwrap();
        let checkout = repo.checkout_at(&root).unwrap().unwrap();
        assert_eq!(
            repo.checkout_at(nested.to_str().unwrap()).unwrap(),
            Some(checkout.clone())
        );
        assert!(repo.checkout_at(&outside).unwrap().is_none());
        assert!(
            repo.worktrees(&checkout).unwrap().contains(
                &std::path::Path::new(&root)
                    .canonical_path()
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_owned()
            )
        );
        assert!(repo.submodules(&checkout).unwrap().is_empty());
        fs::write(std::path::Path::new(&root).join(".gitmodules"),"[submodule \"a\"]\n\tpath = \"mods/with space\" ; note\n\turl = x\n[submodule \"b\"]\n  Path=libs/b\n").unwrap();
        assert_eq!(
            repo.submodules(&checkout).unwrap(),
            ["mods/with space", "libs/b"]
        );
    });
    with_directory(|dir| {
        let IRepoFixture { repo, root, .. } = factory(dir.to_str().unwrap());
        let checkout = repo.checkout_at(&root).unwrap().unwrap();
        for path in [
            ".env",
            ".env.local",
            ".env.example",
            ".envrc",
            ".env.visible",
        ] {
            fs::write(std::path::Path::new(&root).join(path), "A=1\n").unwrap();
        }
        fs::write(
            std::path::Path::new(&root).join(".gitignore"),
            ".env.example\n.envrc\n",
        )
        .unwrap();
        assert!(!repo.is_ignored(&checkout, ".env").unwrap());
        for path in [".env", ".env", ".env.local"] {
            repo.ensure_ignored(&checkout, path).unwrap();
            assert!(repo.is_ignored(&checkout, path).unwrap());
        }
        let mut files = repo.env_files(&checkout, None).unwrap();
        files.sort();
        assert_eq!(files, [".env", ".env.local"]);
        assert!(!repo.is_ignored(&checkout, ".env.visible").unwrap());
        assert!(repo.ensure_ignored(&checkout, "../outside").is_err());
    });
}
