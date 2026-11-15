use envden_core::process::*;
use std::{collections::BTreeMap, fs};

#[test]
fn trust_registry_and_checkout_rejection() {
    let root = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(root.path()).unwrap();
    let checkout = root.join("checkout");
    let bin = root.join("bin");
    fs::create_dir(&checkout).unwrap();
    fs::create_dir(&bin).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::{PermissionsExt, symlink};
        fs::write(checkout.join("tool"), "#!/bin/sh\nexit 0").unwrap();
        fs::set_permissions(checkout.join("tool"), fs::Permissions::from_mode(0o755)).unwrap();
        symlink(checkout.join("tool"), bin.join("tool")).unwrap();
        symlink(&checkout, root.join("alias")).unwrap();
    }
    let mut expected = trusted_directories(None, None);
    expected.push(bin.to_str().unwrap().into());
    let delimiter = if cfg!(windows) { ";" } else { ":" };
    assert_eq!(
        sanitized_environment(
            &BTreeMap::new(),
            &BTreeMap::from([("PATH".into(), "/attacker".into())]),
            bin.to_str()
        )["PATH"]
            .split(delimiter)
            .collect::<Vec<_>>(),
        expected
    );
    set_untrusted_roots(&[checkout.to_str().unwrap().into()]);
    assert!(inside_working_tree(&checkout, None));
    assert!(!inside_working_tree(root.join("checkout-other"), None));
    assert!(resolve_trusted_executable(bin.join("tool").to_str().unwrap()).is_err());
    assert_eq!(
        trusted_directories(
            Some(&[
                checkout.to_str().unwrap().into(),
                root.join("alias").to_str().unwrap().into(),
                bin.to_str().unwrap().into()
            ]),
            None
        ),
        vec![bin.to_str().unwrap().to_owned()]
    );
    assert!(
        !sanitized_environment(&BTreeMap::new(), &BTreeMap::new(), checkout.to_str())
            .get("PATH")
            .unwrap()
            .contains(checkout.to_str().unwrap())
    );
    set_untrusted_roots(&[]);
    fs::write(root.join(".git"), "gitdir: elsewhere").unwrap();
    assert!(inside_working_tree(&bin, None));
    assert!(!inside_working_tree(
        &bin,
        Some(&[root.to_str().unwrap().into()])
    ));
    let prefix = bin.join("prefix");
    fs::create_dir_all(prefix.join(".git")).unwrap();
    assert!(inside_working_tree(
        &prefix,
        Some(&[prefix.to_string_lossy().into()])
    ));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::remove_file(root.join(".git")).unwrap();
        fs::set_permissions(&bin, fs::Permissions::from_mode(0o777)).unwrap();
        assert!(trusted_directories(Some(&[bin.to_str().unwrap().into()]), None).is_empty());
    }
}
