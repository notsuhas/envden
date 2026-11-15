use envden_core::{
    adapters::{INetworkAdapter, INetworkStatus, THttpsCheck},
    errors::{EnvdenError, ErrorCode, Result},
};

pub struct UnsuppliedNetwork;

impl INetworkAdapter for UnsuppliedNetwork {
    fn id(&self) -> &str {
        "unsupplied"
    }
    fn status(&self) -> Result<INetworkStatus> {
        Err(refuse())
    }
    fn check_https_certificate(&self) -> Result<THttpsCheck> {
        Err(refuse())
    }
    fn expose(&self, _: f64) -> Result<String> {
        Err(refuse())
    }
}

fn refuse() -> EnvdenError {
    EnvdenError::new(ErrorCode::Internal, "No network adapter was supplied")
}
