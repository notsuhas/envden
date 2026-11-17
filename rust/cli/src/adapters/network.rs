use envden_core::{
    adapters::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use std::sync::Arc;

pub(super) fn unexpected(operation: &str) -> EnvdenError {
    EnvdenError::new(
        ErrorCode::Internal,
        format!("Unexpected adapter operation: {operation}"),
    )
}

pub(super) fn network(injected: bool) -> Arc<dyn INetworkAdapter> {
    if injected {
        Arc::new(Unsupplied)
    } else {
        Arc::new(envden_adapter_network_tailscale::create_tailscale_network_adapter(None))
    }
}

struct Unsupplied;

impl INetworkAdapter for Unsupplied {
    fn id(&self) -> &str {
        "unsupplied-network"
    }
    fn status(&self) -> Result<INetworkStatus> {
        Err(unexpected("network.status"))
    }
    fn check_https_certificate(&self) -> Result<THttpsCheck> {
        Err(unexpected("network.checkHttpsCertificate"))
    }
    fn expose(&self, _: f64) -> Result<String> {
        Err(unexpected("network.expose"))
    }
}
