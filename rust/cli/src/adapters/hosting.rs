use super::{IAdapters, network::unexpected};
use envden_core::errors::Result;
use std::sync::Arc;

pub type THostServer = Arc<dyn Fn(&IAdapters, u16) -> Result<()> + Send + Sync>;
pub type TServerPort = Arc<dyn Fn() -> Result<u16> + Send + Sync>;
pub type TLocalSetupToken = Arc<dyn Fn(&IAdapters) -> Result<Option<String>> + Send + Sync>;

pub(super) fn host_server(injected: bool) -> THostServer {
    if injected {
        Arc::new(|_, _| Err(unexpected("hostServer")))
    } else {
        Arc::new(|adapters, port| {
            crate::agent::service::system::host_server(adapters, port).map(|_| ())
        })
    }
}

pub(super) fn server_port(injected: bool) -> TServerPort {
    if injected {
        Arc::new(|| Err(unexpected("serverPort")))
    } else {
        Arc::new(crate::onboarding::host::port::choose_port)
    }
}

pub(super) fn local_setup_token(injected: bool) -> TLocalSetupToken {
    if injected {
        Arc::new(|_| Err(unexpected("localSetupToken")))
    } else {
        Arc::new(|adapters| {
            envden_server::identity::local_setup_token(
                &adapters.home.join("server"),
                (adapters.now)(),
            )
        })
    }
}
