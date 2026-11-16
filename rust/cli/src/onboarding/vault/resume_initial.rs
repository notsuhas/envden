use crate::{
    adapters::IAdapters,
    client::{ITransport, text},
    sync::{
        local::{
            applied::{applied_files, save_applied_files},
            files::{base_path, read_bytes, write_bytes},
        },
        remote::{
            accept::accept_head,
            context::{ISyncOptions, sync_context},
            persist::persist_checkpoint,
        },
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use serde_json::json;
use std::{path::Path, rc::Rc};

pub(super) fn resume(adapters: &IAdapters, transport: Rc<dyn ITransport>) -> Result<()> {
    let mut context = sync_context(
        adapters,
        ISyncOptions {
            unlock: None,
            now: adapters.now,
            cwd: None,
            all: true,
            yes: false,
            interactive: false,
            choose: None,
            confirm: None,
            report: None,
        },
        transport,
    )?;
    accept_head(&mut context, None, false)?;
    let header = &context.checkpoint.header.body;
    if header.seq != 2 || header.op != 1 || header.signer != context.identity.record.id {
        return Ok(());
    }
    let mut bases = vec![];
    for entry in &context.checkpoint.files.entries {
        if entry.state != 1 {
            return Ok(());
        }
        let key = &context.keys[&entry.epoch];
        let c = p::IFileContext {
            vault_id: context.vault_id,
            file_id: entry.file_id,
            epoch: entry.epoch,
            version: entry.version,
        };
        let name = p::open_file_name(&entry.name, key, &context.checkpoint.id_key, &c)?;
        let links: Vec<_> = context.state["links"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|link| {
                link["localOnly"] != true
                    && link["path"] == name.path
                    && context.state["approved"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|checkout| {
                            let repo = checkout["repoId"].as_str().unwrap_or_default();
                            checkout["root"] == link["root"]
                                && context.state["aliases"][repo].as_str().unwrap_or(repo)
                                    == name.repo_id
                        })
            })
            .collect();
        if links.is_empty() {
            return Ok(());
        }
        let bytes = context
            .client
            .request(
                &format!("/v1/blobs/{}", text(&entry.blob_hash)),
                "GET",
                None,
            )?
            .body;
        let file = p::open_file(
            &bytes,
            key,
            &context.checkpoint.id_key,
            &c,
            &entry.blob_hash,
            &name,
        )?;
        for link in links {
            let store = link["store"].as_str().unwrap_or_default();
            let root = link["root"].as_str().unwrap_or_default();
            let copy = link["mode"] == "copy";
            let path = if copy {
                Path::new(root).join(&name.path)
            } else {
                store.into()
            };
            if read_bytes(&path)?.as_deref() != Some(&file.content) {
                return Ok(());
            }
            bases.push((
                base_path(&adapters.home, store, copy.then_some(root)),
                file.content.clone(),
            ));
        }
    }
    persist_checkpoint(&mut context)?;
    let mut applied = applied_files(&adapters.home)?;
    for entry in &context.checkpoint.files.entries {
        applied.insert(p::base32(&entry.file_id), json!(text(&p::encode(entry)?)));
    }
    save_applied_files(&adapters.home, applied, (adapters.now)())?;
    for (path, content) in bases {
        write_bytes(&path, Some(&content), (adapters.now)())?;
    }
    Ok(())
}
