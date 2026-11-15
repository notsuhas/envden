use std::{fs, path::Path};
#[test]
fn adapter_crates_have_contract_suites() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../adapters");
    if !root.exists() {
        return;
    }
    for kind in fs::read_dir(root).unwrap() {
        let kind = kind.unwrap();
        if !kind.path().is_dir() {
            continue;
        }
        for implementation in fs::read_dir(kind.path()).unwrap() {
            let root = implementation.unwrap().path();
            if root.join("Cargo.toml").exists() {
                assert!(
                    root.join("tests/contract.rs").exists(),
                    "{} needs a contract suite",
                    root.display()
                );
            }
        }
    }
}
