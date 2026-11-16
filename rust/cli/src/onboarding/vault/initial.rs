use crate::{
    adapters::IAdapters,
    client::{UreqTransport, text},
    state::repository::save_state,
    sync::local::{
        applied::{applied_files, save_applied_files},
        files::write_bytes,
    },
    vault::vault_connection,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::rc::Rc;

pub(in crate::onboarding) fn push_initial(adapters: &IAdapters, state: &mut Value) -> Result<()> {
    push(adapters, state, Rc::new(UreqTransport))
}

fn push(
    adapters: &IAdapters,
    state: &mut Value,
    transport: Rc<dyn crate::client::ITransport>,
) -> Result<()> {
    crate::state::lock::with_state_lock(&adapters.home, &adapters.now, || {
        crate::client::retry_head(|| attempt(adapters, state, transport.clone()))
    })
}

fn attempt(
    adapters: &IAdapters,
    state: &mut Value,
    transport: Rc<dyn crate::client::ITransport>,
) -> Result<()> {
    if state["links"].as_array().is_none_or(Vec::is_empty) {
        return Ok(());
    }
    let connection = vault_connection(adapters, state, transport.clone())?;
    let history =
        crate::vault::history::read_history(&connection.client, &connection.vault_id, None)?;
    let previous = history.headers.last().expect("history");
    if previous.body.seq != 1 {
        return super::resume_initial::resume(adapters, transport);
    }
    let epoch = adapters.keychain.get(
        &format!("envden/{}/epoch/1", adapters.home.display()),
        false,
    )?;
    let id = adapters
        .keychain
        .get(&format!("envden/{}/id-key", adapters.home.display()), false)?;
    let (Some(epoch), Some(id)) = (epoch, id) else {
        return Err(EnvdenError::new(
            ErrorCode::Locked,
            "Vault keys unavailable",
        ));
    };
    let key = &p::fixed(&epoch)?;
    let id = p::fixed(&id)?;
    let (mut files, bases) = super::initial_entries::entries(
        adapters,
        state,
        &connection.client,
        connection.vault_id,
        key,
        &id,
    )?;
    if files.entries.is_empty() {
        return Ok(());
    }
    files.entries.sort_by_key(|v| v.file_id);
    let mut header = previous.body.clone();
    let expected_head = p::object_hash(previous, "manifest")?;
    header.seq = 2;
    header.prev = expected_head;
    header.op = 1;
    header.files_hash = p::h("files", &p::encode(&files)?);
    header.created_at = (adapters.now)();
    let header = p::sign_object(header, &connection.identity.keys.obj_sk, "manifest")?;
    let swap = p::ISwap {
        expected_head,
        header: header.clone(),
        entries: vec![],
        files: Some(files.clone()),
        keyring: None,
        envelope: None,
        opaque_record: None,
        sk_pub: None,
        approver: None,
    };
    connection
        .client
        .request_bytes("/v1/swap", "POST", &p::encode(&swap)?)?;
    state["headers"]
        .as_array_mut()
        .expect("headers")
        .push(json!(text(&p::encode(&header)?)));
    state["files"] = json!(text(&p::encode(&files)?));
    state["checkpoint"] = json!(text(&p::object_hash(&header, "manifest")?));
    save_state(&adapters.home, state, (adapters.now)())?;
    let mut applied = applied_files(&adapters.home)?;
    for entry in files.entries {
        applied.insert(p::base32(&entry.file_id), json!(text(&p::encode(&entry)?)));
    }
    save_applied_files(&adapters.home, applied, (adapters.now)())?;
    for (path, content) in bases.into_entries() {
        write_bytes(&path, Some(&content), (adapters.now)())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Offline(std::path::PathBuf);
    impl crate::client::ITransport for Offline {
        fn fetch(&self, _: crate::client::IHttpRequest) -> Result<crate::client::IHttpResponse> {
            assert!(
                self.0.join("state/write.lock").exists(),
                "initial push must hold state lock"
            );
            Err(EnvdenError::new(ErrorCode::ServerUnreachable, "Offline"))
        }
    }
    #[test]
    fn initial_push_reads_remote_before_trusting_local_checkpoint() {
        let dir = tempfile::tempdir().unwrap();
        let adapters =
            crate::adapters::create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        let mut state = crate::state::empty_state("test");
        state["vaultId"] = p::base32(&[1; 32]).into();
        state["server"] = json!({"address":"https://server.test","pin":text(&[2;32]),"protocol":1});
        state["links"] = json!([{}]);
        assert_eq!(
            push(
                &adapters,
                &mut state,
                Rc::new(Offline(adapters.home.clone()))
            )
            .unwrap_err()
            .code,
            ErrorCode::ServerUnreachable
        );
    }
}
