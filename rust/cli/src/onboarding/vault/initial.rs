use crate::{
    adapters::IAdapters,
    client::{UreqTransport, text},
    state::repository::save_state,
    sync::local::{
        applied::{applied_files, save_applied_files},
        files::{base_path, write_bytes},
    },
    vault::{checkpoint_material, vault_connection},
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde_json::{Value, json};
use std::{path::PathBuf, rc::Rc};

pub(in crate::onboarding) fn push_initial(adapters: &IAdapters, state: &mut Value) -> Result<()> {
    let connection = vault_connection(adapters, state, Rc::new(UreqTransport))?;
    let material = checkpoint_material(adapters, state)?;
    if material.checkpoint.header.body.seq != 1 {
        return Ok(());
    }
    let key = &material.keys[&1];
    let id = material.checkpoint.id_key;
    let mut files = p::IFiles { entries: vec![] };
    let mut bases: Vec<(PathBuf, Vec<u8>)> = vec![];
    for link in state["links"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|v| v["localOnly"] != true)
    {
        let checkout = state["approved"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|c| c["root"] == link["root"])
            .ok_or_else(|| {
                EnvdenError::new(ErrorCode::Unauthorized, "Checkout approval required")
            })?;
        let repo = checkout["repoId"].as_str().unwrap_or_default();
        let repo = state["aliases"][repo].as_str().unwrap_or(repo);
        let path = link["path"].as_str().unwrap_or_default();
        let store = link["store"].as_str().unwrap_or_default();
        let content = std::fs::read(store)
            .map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "File read failed", e))?;
        bases.push((
            base_path(
                &adapters.home,
                store,
                if link["mode"] == "copy" {
                    link["root"].as_str()
                } else {
                    None
                },
            ),
            content.clone(),
        ));
        let file_id = p::file_id(&id, repo, path)?;
        if files.entries.iter().any(|v| v.file_id == file_id) {
            continue;
        }
        let context = p::IFileContext {
            vault_id: connection.vault_id,
            epoch: 1,
            file_id,
            version: 1,
        };
        let blob = p::seal_file(
            &p::IFile {
                repo_id: repo.into(),
                path: path.into(),
                content,
            },
            key,
            &context,
            &p::random_bytes(),
        )?;
        let blob_hash = p::h("blob", &blob);
        connection.client.request_bytes(
            &format!("/v1/blobs/{}", text(&blob_hash)),
            "PUT",
            &blob,
        )?;
        files.entries.push(p::IFileEntry {
            file_id,
            version: 1,
            epoch: 1,
            state: 1,
            blob_hash,
            name: p::seal_file_name(
                &p::IFileName {
                    repo_id: repo.into(),
                    path: path.into(),
                },
                key,
                &context,
                &p::random_bytes(),
            )?,
        });
    }
    if files.entries.is_empty() {
        return Ok(());
    }
    files.entries.sort_by_key(|v| v.file_id);
    let mut header = material.checkpoint.header.body.clone();
    let expected_head = p::object_hash(&material.checkpoint.header, "manifest")?;
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
    for (path, content) in bases {
        write_bytes(&path, Some(&content), (adapters.now)())?;
    }
    Ok(())
}
