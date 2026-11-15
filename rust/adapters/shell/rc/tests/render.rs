use envden_adapter_shell_rc::{TShell, create_rc_shell_adapter};
use envden_core::adapters::IShellAdapter;
#[cfg(unix)]
use std::path::Path;

#[cfg(unix)]
#[test]
fn typescript_vectors() {
    for fixture in [
        include_str!("render-vectors.json"),
        include_str!("snapshots.json"),
    ] {
        let cases: serde_json::Value = serde_json::from_str(fixture).unwrap();
        for row in cases.as_array().unwrap() {
            let shell = match row["shell"].as_str().unwrap() {
                "bash" => TShell::Bash,
                "zsh" => TShell::Zsh,
                "fish" => TShell::Fish,
                _ => TShell::Powershell,
            };
            let adapter = create_rc_shell_adapter(
                shell,
                "/unused",
                Some(Path::new(row["home"].as_str().unwrap())),
                None,
                None,
            );
            let snippet = adapter
                .hook_snippet(row["binary"].as_str().unwrap())
                .unwrap();
            assert!(!snippet.contains("git "));
            let physical = match shell {
                TShell::Powershell => "(Get-Location).ProviderPath",
                TShell::Zsh => "${PWD:A}",
                _ => "pwd -P",
            };
            assert!(snippet.contains(physical));
            let age = match shell {
                TShell::Powershell => ".TotalSeconds -gt 60",
                TShell::Fish => ") -gt 60",
                _ => "\" -gt 60 ]; then",
            };
            assert!(snippet.contains(age));
            assert!(adapter.hook_snippet("relative").is_err());
            assert_eq!(
                adapter
                    .hook_snippet(row["binary"].as_str().unwrap())
                    .unwrap(),
                row["expected"].as_str().unwrap()
            );
        }
    }
}

#[test]
fn invalid_paths_are_typed_and_profile_resolution_is_lazy() {
    use envden_core::errors::ErrorCode;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let home = tempfile::tempdir().unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let captured = calls.clone();
    let path = home.path().join("custom.ps1");
    let profile = path.clone();
    let adapter = create_rc_shell_adapter(
        TShell::Powershell,
        home.path(),
        None,
        None,
        Some(Box::new(move || {
            captured.fetch_add(1, Ordering::SeqCst);
            Some(profile.clone())
        })),
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert_eq!(adapter.rc_path(), path.to_string_lossy());
    assert_eq!(adapter.rc_path(), path.to_string_lossy());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    for binary in ["relative", "/bad\npath"] {
        assert_eq!(
            adapter.hook_snippet(binary).unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }
}
