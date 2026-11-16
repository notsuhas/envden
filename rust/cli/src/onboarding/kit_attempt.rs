use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use std::path::Path;

pub(super) fn submit(
    client: &crate::client::IClient,
    swap: &p::ISwap,
    public: &[u8; 32],
) -> Result<()> {
    if !swap
        .entries
        .first()
        .is_some_and(|entry| p::verify_object(entry, public, "entry"))
    {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Recovery key is no longer current",
        ));
    }
    client.request_bytes("/v1/swap", "POST", &p::encode(swap)?)?;
    Ok(())
}

pub(super) fn pending_matches(path: &Path, attempt: &str) -> Result<bool> {
    Ok(crate::state::files::optional_read(path)?.is_some_and(|v| v == attempt))
}

pub(super) fn remove_pending(path: &Path) -> Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(crate::state::files::failure(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_swap_is_verified_before_network() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let identity = crate::identity::device_identity(
            &*adapters.keychain,
            &adapters.home,
            "test",
            false,
            &|| 42,
        )
        .unwrap();
        let material = crate::vault::create_genesis(&identity, [2; 32], 42).unwrap();
        let creation = crate::vault::create_vault_swap(
            &material,
            &identity,
            "password",
            &crate::client::text(&[0; 192]),
            42,
        )
        .unwrap();
        struct Offline;
        impl crate::client::ITransport for Offline {
            fn fetch(
                &self,
                _: crate::client::IHttpRequest,
            ) -> Result<crate::client::IHttpResponse> {
                Err(envden_core::errors::EnvdenError::new(
                    envden_core::errors::ErrorCode::ServerUnreachable,
                    "Offline",
                ))
            }
        }
        let mut client = super::super::vault::connection::connection(
            &adapters,
            "http://server.test",
            [2; 32],
            material.vault_id,
            &identity,
        );
        client.options.transport = std::rc::Rc::new(Offline);
        let error = submit(&client, &creation.swap, &[0; 32]).unwrap_err();
        assert_eq!(error.code, envden_core::errors::ErrorCode::InvalidData);
        assert_eq!(error.message, "Recovery key is no longer current");
    }

    #[test]
    fn pending_kit_only_ignores_missing_files() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing");
        assert!(!pending_matches(&missing, "attempt").unwrap());
        remove_pending(&missing).unwrap();
        assert!(pending_matches(dir.path(), "attempt").is_err());
        assert!(remove_pending(dir.path()).is_err());
    }
}
