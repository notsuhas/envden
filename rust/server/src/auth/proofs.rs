use crate::{http::types::IAppOptions, middleware::IAuth};
use envden_core::{
    adapters::storage::TStateKind,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;

pub(crate) fn has_proof(options: &IAppOptions, auth: &IAuth, kind: &str) -> Result<bool> {
    let Some(proof) = &auth.proof else {
        return Ok(false);
    };
    let storage = options.storage.as_ref();
    let request = &auth.request;
    let vault = storage.vault(&request.vault_id)?;
    if kind == "sk" {
        let public = storage.state(&request.vault_id, TStateKind::SkPub, &[])?;

        return Ok(!vault.is_some_and(|v| v.sk_refused)
            && public.is_some_and(|key| {
                fixed(&key)
                    .ok()
                    .is_some_and(|key| verify_sk_proof(&key, request, proof).unwrap_or(false))
            }));
    }
    if kind == "setup" && storage.has_vault(&request.vault_id)? {
        return Ok(false);
    }
    let key = if kind == "setup" {
        storage.setup_token()?
    } else {
        vault.and_then(|v| v.restored).map(|r| r.repair_token_hash)
    };
    let Some(key) = key else {
        return Ok(false);
    };

    verify_token_proof(
        if kind == "setup" {
            TTokenKind::Setup
        } else {
            TTokenKind::Repair
        },
        &fixed(&key)?,
        request,
        proof,
    )
}

pub(crate) fn require_ticket(options: &IAppOptions, auth: &IAuth) -> Result<()> {
    let mut key = super::session_key(auth, "kit");
    key.kind = envden_core::adapters::storage::TSessionKind::JoinTicket;
    if options
        .storage
        .session(&auth.request.vault_id, &key, (options.now)())?
        .is_none()
    {
        return Err(EnvdenError::new(
            ErrorCode::Unauthorized,
            "Join ticket required",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::types::IServerKeys;
    use envden_core::adapters::storage::{IRestoredVault, IStoredVault};
    use envden_testing::storage::IFakeStorageAdapter;
    use std::sync::{Arc, Mutex};

    #[test]
    fn sk_and_repair_proofs_bind_requests_and_honor_refusal() {
        let state = Arc::new(Mutex::new(IStoredVault {
            active: true,
            ..Default::default()
        }));
        let vault = state.clone();
        let secret = [7; 16];
        let id = [2; 32];
        let options = IAppOptions {
            storage: Arc::new(IFakeStorageAdapter {
                vault: Some(Box::new(move |_| Ok(Some(vault.lock().unwrap().clone())))),
                state: Some(Box::new(move |_, _, _| {
                    Ok(Some(sk_pub(&secret, &id).to_vec()))
                })),
                ..Default::default()
            }),
            storage_lock: Arc::new(Mutex::new(())),
            now: Arc::new(|| 1000000),
            server_keys: IServerKeys {
                secret_key: [0; 32],
                public_key: [0; 32],
                opaque_setup: String::new(),
            },
            app_version: "1.0.0".into(),
            min_client: "1.0.0".into(),
        };
        let request = IRequest {
            server_pin: [0; 32],
            vault_id: id,
            method: "GET".into(),
            path_and_query: "/v1/settings/unlock-period".into(),
            body_hash: [0; 32],
            time: 1000000,
            nonce: [0; 16],
            device: [0; 16],
            client_version: "1.0.0".into(),
        };
        let mut auth = IAuth {
            proof: Some(sign_sk_proof(&secret, &id, &request).unwrap().to_vec()),
            request,
            member: true,
        };
        assert!(has_proof(&options, &auth, "sk").unwrap());
        let signed = auth.proof.clone();
        auth.proof = Some(vec![0; 64]);
        assert!(!has_proof(&options, &auth, "sk").unwrap());
        auth.proof = signed;
        state.lock().unwrap().sk_refused = true;
        assert!(!has_proof(&options, &auth, "sk").unwrap());
        let repair = token_key(TTokenKind::Repair, &[9; 20]);
        state.lock().unwrap().restored = Some(IRestoredVault {
            repair_token_hash: repair.to_vec(),
            restored_head: vec![8; 32],
            finish_progress: None,
        });
        auth.proof = Some(
            token_proof(TTokenKind::Repair, &repair, &auth.request)
                .unwrap()
                .to_vec(),
        );
        assert!(has_proof(&options, &auth, "repair").unwrap());
        auth.proof = Some(sign_sk_proof(&secret, &id, &auth.request).unwrap().to_vec());
        assert!(!has_proof(&options, &auth, "repair").unwrap());
    }
}
