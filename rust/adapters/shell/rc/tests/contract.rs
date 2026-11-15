use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
#[test]
fn contracts() {
    for shell in [TShell::Bash, TShell::Zsh, TShell::Fish, TShell::Powershell] {
        envden_testing::shell::shell_contract(|home| {
            Box::new(create_rc_shell_adapter(shell, home, None, None, None))
        });
    }
}
#[test]
fn preserves_bytes_and_symlink() {
    let home = tempfile::tempdir().unwrap();
    let original = b"# user \xff\r\n";
    let target = home.path().join("dotfile");
    std::fs::write(&target, original).unwrap();
    std::os::unix::fs::symlink(&target, home.path().join(".zshrc")).unwrap();
    let adapter = create_rc_shell_adapter(TShell::Zsh, home.path(), None, None, None);
    adapter.install("/bin/envden").unwrap();
    adapter.uninstall().unwrap();
    assert_eq!(std::fs::read(&target).unwrap(), original);
    assert!(home.path().join(".zshrc").is_symlink());
}
