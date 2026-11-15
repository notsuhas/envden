use crate::{adapters::IAdapters, program::IInvocation};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let address = crate::onboarding::require_server_address(&invocation.arguments[0])?;
    let options = serde_json::to_value(&invocation.options).expect("options");
    let state = crate::onboarding::run_join(adapters, &address, &options)?;
    for line in super::summary::summary(&state, &adapters.user_home, false) {
        println!("{line}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{
        adapters::create_adapters,
        state::{empty_state, repository::save_state},
    };
    #[test]
    fn existing_checkpoint_routes_to_rejoin() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let mut state = empty_state("test");
        state["vaultId"] = "vault".into();
        state["checkpoint"] = "floor".into();
        save_state(&adapters.home, &state, 42).unwrap();
        let error = crate::onboarding::run_join(
            &adapters,
            "https://server.test",
            &serde_json::json!({"recoveryKit":dir.path().join("missing.json"), "name":"test"}),
        )
        .unwrap_err();
        assert_ne!(error.code, envden_core::errors::ErrorCode::Conflict);
        assert_eq!(
            crate::state::repository::load_state(&adapters.home)
                .unwrap()
                .unwrap(),
            state
        );
    }
}
