use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub(super) fn checkpoint(
    headers: &[p::ISigned<p::IManifestHeader>],
    id: &[u8; 16],
) -> Result<[u8; 32]> {
    let own = headers
        .iter()
        .find(|h| h.body.op == 3 && h.body.signer == *id)
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing kit join checkpoint"))?;
    p::object_hash(own, "manifest")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters,
        identity::device_identity,
        vault::{create_genesis, create_vault_swap},
    };
    #[test]
    fn resumed_kit_accepts_its_original_join_checkpoint() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let identity =
            device_identity(&*adapters.keychain, &adapters.home, "test", false, 42).unwrap();
        let material = create_genesis(&identity, [2; 32], 42).unwrap();
        let creation = create_vault_swap(
            &material,
            &identity,
            "password",
            &crate::client::text(&[0; 192]),
            42,
        )
        .unwrap();
        let mut own = creation.swap.header;
        own.body.op = 3;
        let mut later = own.clone();
        later.body.seq += 1;
        later.body.op = 1;
        assert_eq!(
            checkpoint(&[own.clone(), later], &identity.record.id).unwrap(),
            p::object_hash(&own, "manifest").unwrap()
        );
        assert!(checkpoint(&[own], &[9; 16]).is_err());
    }
}
