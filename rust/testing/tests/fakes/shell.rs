use envden_core::adapters::*;
use envden_testing::shell;
#[test]
fn shell_rc_path_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = shell::IFakeShellAdapter::default().rc_path();
        }),
        "shell.rcPath",
    );
}

#[test]
fn shell_hook_snippet_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = shell::IFakeShellAdapter::default().hook_snippet("");
        }),
        "shell.hookSnippet",
    );
}

#[test]
fn shell_installed_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = shell::IFakeShellAdapter::default().installed();
        }),
        "shell.installed",
    );
}

#[test]
fn shell_install_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = shell::IFakeShellAdapter::default().install("");
        }),
        "shell.install",
    );
}

#[test]
fn shell_uninstall_is_strict() {
    super::unexpected(
        std::panic::catch_unwind(|| {
            let _ = shell::IFakeShellAdapter::default().uninstall();
        }),
        "shell.uninstall",
    );
}

#[test]
fn shell_hook_snippet_preserves_typed_errors() {
    use envden_core::errors::{EnvdenError, ErrorCode};
    let fake = shell::IFakeShellAdapter {
        hook_snippet: Some(Box::new(|_| {
            Err(EnvdenError::new(
                ErrorCode::InvalidInput,
                "Invalid hook path",
            ))
        })),
        ..Default::default()
    };
    assert_eq!(
        fake.hook_snippet("relative").unwrap_err().code,
        ErrorCode::InvalidInput
    );
}
