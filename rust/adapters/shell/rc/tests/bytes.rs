use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
use std::fs;

#[test]
fn non_utf8_crlf_install_is_idempotent() {
    let home = tempfile::tempdir().unwrap();
    let adapter = create_rc_shell_adapter(TShell::Bash, home.path(), None, None, None);
    let original = [35, 32, 255, 13, 10];
    fs::write(adapter.rc_path(), original).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(adapter.rc_path(), fs::Permissions::from_mode(0o640)).unwrap();
    }
    adapter.install("/opt/envden").unwrap();
    adapter.install("/opt/envden").unwrap();
    let current = fs::read(adapter.rc_path()).unwrap();
    assert!(current.starts_with(&original));
    let text = String::from_utf8_lossy(&current);
    assert_eq!(text.matches("# >>> envden >>>").count(), 1);
    assert!(!text.replace("\r\n", "").contains('\n'));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(adapter.rc_path())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o640
        );
    }
    adapter.uninstall().unwrap();
    assert_eq!(fs::read(adapter.rc_path()).unwrap(), original);
}

#[test]
fn orphan_marker_keeps_user_lines() {
    let home = tempfile::tempdir().unwrap();
    let adapter = create_rc_shell_adapter(TShell::Zsh, home.path(), None, None, None);
    let original = "# >>> envden >>>\n# user line\n";
    fs::write(adapter.rc_path(), original).unwrap();
    assert!(!adapter.installed().unwrap());
    adapter.install("/opt/envden").unwrap();
    assert!(adapter.installed().unwrap());
    adapter.uninstall().unwrap();
    assert_eq!(fs::read(adapter.rc_path()).unwrap(), original.as_bytes());
}
