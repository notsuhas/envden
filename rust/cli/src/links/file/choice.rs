use envden_core::errors::Result;
use std::io::{self, IsTerminal};

pub(super) fn choose_version(path: &str) -> Result<String> {
    if !io::stdin().is_terminal() {
        return Ok("skip".into());
    }
    crate::output::prompts::choose(
        &format!("{path} differs from the synced copy"),
        &[
            ("separate".into(), "Keep separate (local only)".into()),
            ("store".into(), "Use the synced version".into()),
        ],
        None,
    )
}
