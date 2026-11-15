#![cfg(unix)]
use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::{adapters::IShellAdapter, errors::ErrorCode};
use std::{fs, os::unix::fs::PermissionsExt};

#[test]
fn crlf_mode_orphans_and_backups() {
    let home = tempfile::tempdir().unwrap();
    let backup = home.path().join("backups");
    let adapter = create_rc_shell_adapter(TShell::Zsh, home.path(), None, Some(&backup), None);
    let original = b"# >>> envden >>>\r\n# user \xff\r\n";
    fs::write(adapter.rc_path(), original).unwrap();
    fs::set_permissions(adapter.rc_path(), fs::Permissions::from_mode(0o440)).unwrap();
    assert!(!adapter.installed().unwrap());
    adapter.install("/opt/envden").unwrap();
    let installed = fs::read(adapter.rc_path()).unwrap();
    assert!(installed.starts_with(original));
    assert!(
        !String::from_utf8_lossy(&installed)
            .replace("\r\n", "")
            .contains('\n')
    );
    assert_eq!(
        fs::metadata(adapter.rc_path())
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o440
    );
    adapter.install("/opt/envden").unwrap();
    assert_eq!(fs::read(adapter.rc_path()).unwrap(), installed);
    adapter.uninstall().unwrap();
    assert_eq!(fs::read(adapter.rc_path()).unwrap(), original);
    let entries: Vec<_> = fs::read_dir(backup)
        .unwrap()
        .map(|e| fs::read(e.unwrap().path()).unwrap())
        .collect();
    assert_eq!(entries.len(), 2);
    assert!(entries.contains(&original.to_vec()));
    assert!(entries.contains(&installed));
}

#[test]
fn hard_links_and_dangling_links() {
    let home = tempfile::tempdir().unwrap();
    let path = home.path().join(".zshrc");
    let other = home.path().join("other");
    fs::write(&other, "private").unwrap();
    fs::hard_link(&other, &path).unwrap();
    let adapter = create_rc_shell_adapter(TShell::Zsh, home.path(), None, None, None);
    assert_eq!(
        adapter.install("/opt/envden").unwrap_err().code,
        ErrorCode::InvalidInput
    );
    assert_eq!(fs::read_to_string(&other).unwrap(), "private");
    fs::remove_file(&path).unwrap();
    let target = home.path().join("dotfiles/rc");
    std::os::unix::fs::symlink(&target, &path).unwrap();
    adapter.install("/opt/envden").unwrap();
    assert!(path.is_symlink());
    assert!(target.is_file());
    adapter.uninstall().unwrap();
    assert_eq!(fs::read(&target).unwrap(), b"");
}
