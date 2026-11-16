use crate::{adapters::IAdapters, program::IInvocation};
use envden_core::errors::Result;

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let address = crate::onboarding::require_server_address(&invocation.arguments[0])?;
    let options = serde_json::to_value(&invocation.options).expect("options");
    let rejoin = crate::state::repository::load_state(&adapters.home)?
        .is_some_and(|state| crate::onboarding::local_state::is_rejoin(&state));
    let state = crate::onboarding::run_join(adapters, &address, &options)?;
    for line in join_summary(&state, &adapters.user_home, rejoin) {
        println!("{line}");
    }
    Ok(())
}

fn join_summary(state: &serde_json::Value, home: &std::path::Path, rejoin: bool) -> Vec<String> {
    if rejoin {
        Vec::new()
    } else {
        super::summary::summary(state, home, false)
    }
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

#[cfg(test)]
mod summary_tests {
    use super::*;
    #[test]
    fn rejoin_omits_the_fresh_join_summary() {
        let state = crate::state::empty_state("test");
        assert!(!join_summary(&state, std::path::Path::new("/tmp"), false).is_empty());
        assert!(join_summary(&state, std::path::Path::new("/tmp"), true).is_empty());
    }
}

#[cfg(test)]
mod checkpoint_tests {
    #[test]
    fn empty_checkpoint_uses_fresh_join_summary() {
        let state = serde_json::json!({"checkpoint":""});
        let rejoin = crate::onboarding::local_state::is_rejoin(&state);
        assert!(!rejoin);
    }
}
