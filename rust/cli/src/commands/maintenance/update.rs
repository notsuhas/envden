use crate::{
    adapters::IAdapters,
    output::{print, terminal_json},
    program::IInvocation,
    updates::{check::run_update_check, fetch::HttpFetcher, maintenance::refresh_installation},
};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let command_time = (adapters.now)();
    if invocation
        .options
        .get("postInstall")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        refresh_installation(adapters);
        return Ok(());
    }
    if invocation
        .options
        .get("check")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        print(&terminal_json(&run_update_check(
            adapters,
            command_time,
            true,
            &HttpFetcher,
        )?));
        return Ok(());
    }
    print(&terminal_json(
        &crate::updates::self_update::run::self_update(adapters, &HttpFetcher)?,
    ));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn captures_command_time_before_post_install() {
        static CALLS: AtomicUsize = AtomicUsize::new(0);
        let temp = tempfile::tempdir().unwrap();
        let adapters = crate::adapters::create_adapters(
            Some(temp.path().join("home")),
            temp.path().into(),
            || {
                CALLS.fetch_add(1, Ordering::SeqCst);
                42
            },
        );
        let crate::program::TParseResult::Action(invocation) = crate::program::parse(
            crate::program::command_tree(),
            &["update".into(), "--post-install".into()],
        ) else {
            panic!("action expected")
        };
        run(&invocation, &adapters).unwrap();
        assert_eq!(CALLS.load(Ordering::SeqCst), 1);
    }
}
