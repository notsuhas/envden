#![cfg(unix)]
use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
};

#[test]
fn all_shells_edit_linked_targets_and_keep_private_backups() {
    for shell in [TShell::Bash, TShell::Zsh, TShell::Fish, TShell::Powershell] {
        let home = tempfile::tempdir().unwrap();
        let backups = home.path().join("backups");
        let adapter = create_rc_shell_adapter(
            shell,
            home.path(),
            None,
            Some(&backups),
            Some(Box::new(|| None)),
        );
        let rc = adapter.rc_path();
        fs::create_dir_all(Path::new(&rc).parent().unwrap()).unwrap();
        let target = home.path().join("dotfile");
        fs::write(&target, "# user\n").unwrap();
        symlink(&target, &rc).unwrap();
        for install in [true, false] {
            if install {
                adapter.install("/opt/envden").unwrap();
            } else {
                adapter.uninstall().unwrap();
            }
            assert!(Path::new(&rc).is_symlink());
            assert!(fs::read_to_string(&target).unwrap().contains("# user\n"));
        }
        assert_eq!(fs::read(&target).unwrap(), b"# user\n");
        let files: Vec<_> = fs::read_dir(&backups)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        assert_eq!(files.len(), 2);
        assert_eq!(
            fs::metadata(&backups).unwrap().permissions().mode() & 0o777,
            0o700
        );
        for file in files {
            assert_eq!(
                fs::metadata(file).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
}
