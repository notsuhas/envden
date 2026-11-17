use crate::{
    agent::service::port::IPortProbe,
    client::{UreqTransport, hello},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use std::net::TcpListener;

pub(super) struct Probe;
impl IPortProbe for Probe {
    fn free(&self, port: u16) -> Result<bool> {
        Ok(TcpListener::bind(("127.0.0.1", port)).is_ok())
    }
    fn envden(&self, port: u16) -> Result<bool> {
        Ok(hello(
            &format!("http://127.0.0.1:{port}"),
            None,
            &UreqTransport,
            "0.0.0",
        )
        .is_ok())
    }
    fn any_free(&self) -> Result<u16> {
        TcpListener::bind(("127.0.0.1", 0))
            .and_then(|v| v.local_addr())
            .map(|v| v.port())
            .map_err(|e| {
                EnvdenError::with_source(ErrorCode::Internal, "Cannot choose server port", e)
            })
    }
}

pub(crate) fn choose_port() -> Result<u16> {
    crate::agent::service::port::choose_server_port(&Probe, None)
}
