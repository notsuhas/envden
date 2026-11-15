#![cfg(windows)]
use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
use std::fs;

#[test]
fn rc_preserves_bytes_and_readonly_attribute_with_private_backup() {
    let home = tempfile::tempdir().unwrap();
    let backups = home.path().join("backups");
    let adapter =
        create_rc_shell_adapter(TShell::Powershell, home.path(), None, Some(&backups), None);
    let rc = adapter.rc_path();
    fs::create_dir_all(std::path::Path::new(&rc).parent().unwrap()).unwrap();
    fs::write(&rc, b"# user \xff\r\n").unwrap();
    let original_permissions = fs::metadata(&rc).unwrap().permissions();
    let mut permissions = original_permissions.clone();
    permissions.set_readonly(true);
    fs::set_permissions(&rc, permissions).unwrap();
    adapter
        .install(home.path().join("envden.exe").to_str().unwrap())
        .unwrap();
    assert!(fs::metadata(&rc).unwrap().permissions().readonly());
    adapter.uninstall().unwrap();
    assert_eq!(fs::read(&rc).unwrap(), b"# user \xff\r\n");
    assert_eq!(fs::read_dir(&backups).unwrap().count(), 2);
    let output = envden_core::process::exec_trusted_sync(
        "icacls",
        &[backups.to_string_lossy().into_owned()],
        &Default::default(),
    )
    .unwrap();
    assert!(!output.contains("(I)"));
    fs::set_permissions(&rc, original_permissions).unwrap();
}
