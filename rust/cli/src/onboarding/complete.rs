use crate::{
    adapters::IAdapters,
    client::UreqTransport,
    state::repository::load_state,
    sync::{engine::first_sync, remote::context::ISyncOptions},
};
use envden_core::errors::Result;
use serde_json::Value;
use std::rc::Rc;

pub(super) fn first_run(adapters: &IAdapters) -> Result<Value> {
    first_run_with(adapters, |options| {
        first_sync(adapters, options, Rc::new(UreqTransport))
    })
}

fn first_run_with(
    adapters: &IAdapters,
    run: impl FnOnce(ISyncOptions) -> Result<Value>,
) -> Result<Value> {
    run(ISyncOptions {
        unlock: None,
        now: adapters.now,
        cwd: std::env::current_dir().ok(),
        all: true,
        yes: false,
        interactive: true,
        choose: Some(Rc::new(|path| {
            crate::output::prompts::choose(
                &format!(
                    "{} differs from the server's copy",
                    crate::output::sanitize_terminal(path)
                ),
                &[
                    ("keep-mine".into(), "Keep mine".into()),
                    ("take-server".into(), "Take the server's".into()),
                    ("merge".into(), "Merge both".into()),
                ],
                None,
            )
        })),
        confirm: None,
        report: None,
    })?;
    let state = crate::state::require_configured(load_state(&adapters.home)?)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_sync_does_not_report() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let error = first_run_with(&adapters, |options| {
            assert!(options.report.is_none());
            Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::Internal,
                "test",
            ))
        })
        .unwrap_err();
        assert_eq!(error.message, "test");
    }
    #[test]
    fn completed_join_does_not_refresh_notice_again() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let mut state = crate::state::empty_state("test");
        state["vaultId"] = serde_json::json!("vault");
        state["server"] = serde_json::json!({"address":"http://server.test"});
        crate::state::repository::save_state(&adapters.home, &state, 42).unwrap();
        std::fs::create_dir(adapters.home.join("state/approved-checkouts")).unwrap();
        assert_eq!(
            first_run_with(&adapters, |_| Ok(state.clone())).unwrap(),
            state
        );
    }
}
