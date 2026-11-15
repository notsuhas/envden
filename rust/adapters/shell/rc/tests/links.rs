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
    let backup_name = regex::Regex::new(r"^\.envden-backup-[0-9a-f-]{36}$").unwrap();
    for shell in [TShell::Bash, TShell::Zsh, TShell::Fish, TShell::Powershell] {
        for install in [true, false] {
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
            let original = if install {
                "# user\n".into()
            } else {
                format!("# user\n{}", adapter.hook_snippet("/opt/envden").unwrap())
            };
            fs::write(&target, &original).unwrap();
            symlink(&target, &rc).unwrap();
            if install {
                adapter.install("/opt/envden").unwrap();
            } else {
                adapter.uninstall().unwrap();
            }
            assert_eq!(adapter.installed().unwrap(), install);
            assert!(Path::new(&rc).is_symlink());
            assert!(fs::read_to_string(&target).unwrap().starts_with("# user\n"));
            let files: Vec<_> = fs::read_dir(&backups)
                .unwrap()
                .map(|e| e.unwrap().path())
                .collect();
            assert_eq!(files.len(), 1);
            assert_eq!(fs::read(&files[0]).unwrap(), original.as_bytes());
            let name = files[0].file_name().unwrap().to_str().unwrap();
            assert!(name.starts_with(".envden-backup-"));
            assert!(backup_name.is_match(name));
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
}

#[test]
fn edits_through_linked_folders_and_dangling_links() {
    for shell in [TShell::Fish, TShell::Zsh] {
        let home = tempfile::tempdir().unwrap();
        let adapter = create_rc_shell_adapter(shell, home.path(), None, None, None);
        let rc = std::path::PathBuf::from(adapter.rc_path());
        let dotfiles = home.path().join("dotfiles");
        fs::create_dir(&dotfiles).unwrap();
        fs::create_dir_all(rc.parent().unwrap()).unwrap();
        let linked = if matches!(shell, TShell::Fish) {
            rc.parent().unwrap().to_owned()
        } else {
            rc.clone()
        };
        if linked.is_dir() {
            fs::remove_dir(&linked).unwrap();
        }
        let target = dotfiles.join(rc.file_name().unwrap());
        symlink(
            if matches!(shell, TShell::Fish) {
                &dotfiles
            } else {
                &target
            },
            &linked,
        )
        .unwrap();
        adapter.install("/opt/envden").unwrap();
        assert!(linked.is_symlink());
        assert!(
            fs::read_to_string(&target)
                .unwrap()
                .contains("# >>> envden >>>")
        );
        adapter.uninstall().unwrap();
        assert!(linked.is_symlink());
        assert_eq!(fs::read(target).unwrap(), b"");
    }
}
