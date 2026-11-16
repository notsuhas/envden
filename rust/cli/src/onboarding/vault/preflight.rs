use crate::{
    client::{ITransport, hello},
    version::MIN_SERVER,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub(super) fn preflight(hosted: bool, check: impl FnOnce() -> Result<()>) -> Result<()> {
    if hosted {
        return Ok(());
    }

    check()
}

pub(super) fn check_server(address: &str, token: &str, transport: &dyn ITransport) -> Result<()> {
    let server = hello(address, None, transport, MIN_SERVER).map_err(|error| {
        if matches!(
            error.code,
            ErrorCode::ServerTooOld | ErrorCode::UpdateRequired
        ) {
            error
        } else {
            EnvdenError::with_source(
                ErrorCode::ServerUnreachable,
                format!("Can't reach {address}. Check the address and that the server is running"),
                error,
            )
        }
    })?;
    let token = p::decode_token(p::TTokenKind::Setup, token)?;
    if server.pin != token.1 {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "This setup token is for a different server",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_failure_precedes_invalid_setup_token() {
        struct Offline;
        impl ITransport for Offline {
            fn fetch(
                &self,
                _: crate::client::IHttpRequest,
            ) -> Result<crate::client::IHttpResponse> {
                Err(EnvdenError::new(ErrorCode::ServerUnreachable, "Offline"))
            }
        }
        assert_eq!(
            check_server("http://server.test", "invalid", &Offline)
                .unwrap_err()
                .code,
            ErrorCode::ServerUnreachable
        );
    }

    #[test]
    fn hosted_setup_defers_server_check_until_after_prompts() {
        preflight(true, || panic!("hosted setup must prompt before hello")).unwrap();
        assert!(
            preflight(false, || Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::Unauthorized,
                "test"
            )))
            .is_err()
        );
    }
}
