use crate::{adapters::IAdapters, program::IInvocation};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_server::IServeOptions;
use std::{collections::BTreeMap, sync::Arc};

pub fn setup_token_from(env: &mut BTreeMap<String, String>) -> Option<String> {
    env.remove("ENVDEN_SETUP_TOKEN").filter(|s| !s.is_empty())
}

pub fn run(invocation: &IInvocation<'_>, adapters: &IAdapters) -> Result<()> {
    let options = &invocation.options;
    let mut environment = std::env::vars().collect();
    let setup_token = setup_token_from(&mut environment);
    let clock = adapters.now;
    let runtime = tokio::runtime::Runtime::new()
        .map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "Server start failed", e))?;
    runtime.block_on(async {
        #[cfg(unix)]
        let (mut terminate, mut interrupt) = {
            use tokio::signal::unix::{SignalKind, signal};
            let failure =
                |e| EnvdenError::with_source(ErrorCode::Internal, "Server shutdown failed", e);
            (
                signal(SignalKind::terminate()).map_err(failure)?,
                signal(SignalKind::interrupt()).map_err(failure)?,
            )
        };
        let mut server = envden_server::serve(IServeOptions {
            data_dir: options
                .get("dataDir")
                .and_then(|v| v.as_str())
                .map(Into::into),
            port: options
                .get("port")
                .and_then(|v| v.as_u64())
                .map(|n| n as u16),
            min_client: options
                .get("minClient")
                .and_then(|v| v.as_str())
                .map(Into::into),
            restored: options
                .get("restored")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            setup_token,
            now: Some(Arc::new(clock)),
            ..Default::default()
        })
        .await?;
        #[cfg(unix)]
        tokio::select! { _ = terminate.recv() => {}, _ = interrupt.recv() => {} }
        #[cfg(not(unix))]
        tokio::signal::ctrl_c().await.map_err(|e| {
            EnvdenError::with_source(ErrorCode::Internal, "Server shutdown failed", e)
        })?;
        server.shutdown().await
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn consumes_nonempty_token_only() {
        for (value, expected) in [("", None), ("token", Some("token")), (" ", Some(" "))] {
            let mut env = BTreeMap::from([("ENVDEN_SETUP_TOKEN".into(), value.into())]);
            assert_eq!(setup_token_from(&mut env).as_deref(), expected);
            assert!(!env.contains_key("ENVDEN_SETUP_TOKEN"));
        }
        assert_eq!(setup_token_from(&mut BTreeMap::new()), None);
    }
}
