use super::context::{cached_bytes, invalid, repair_context, stored_history};
use crate::{
    adapters::IAdapters,
    admin::shared::{history::check_floor, transfer::history_swaps},
    client::{ITransport, binary, text},
    state::{
        files::{atomic_write, optional_read},
        lock::with_state_lock,
    },
    vault::history::read_history,
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::protocol as p;
use std::rc::Rc;

pub fn upload_repair(
    adapters: &IAdapters,
    token: &str,
    transport: Rc<dyn ITransport>,
) -> Result<()> {
    with_state_lock(&adapters.home, &adapters.now, || {
        let (context, id) = repair_context(adapters, token, transport)?;
        let remote = read_history(&context.client, &context.vault_id, None)?;
        let stored = stored_history(&context)?;
        let remote_head = remote.headers.last().expect("history");
        let local_head = stored
            .headers
            .last()
            .ok_or_else(|| invalid(ErrorCode::InvalidData, "Invalid stored chain"))?;
        let evidence = adapters
            .home
            .join("state")
            .join(format!("repair-restored-{}", text(&id)));
        if optional_read(&evidence)?.is_none() {
            atomic_write(
                &evidence,
                text(&p::object_hash(remote_head, "manifest")?).as_bytes(),
                (adapters.now)(),
            )?;
        }
        if local_head.body.seq > remote_head.body.seq {
            let mut floor = context.local.clone();
            floor["headers"] = serde_json::json!(
                remote
                    .headers
                    .iter()
                    .map(|h| p::encode(h).map(|b| text(&b)))
                    .collect::<Result<Vec<_>>>()?
            );
            check_floor(&floor, &stored)?;
        } else {
            check_floor(&context.local, &remote)?;
        }
        let files: p::IFiles = context.local["files"]
            .as_str()
            .map(|v| binary(v).and_then(|b| p::decode(&b)))
            .transpose()?
            .unwrap_or(p::IFiles { entries: vec![] });
        let mut blobs = Vec::new();
        for file in &files.entries {
            if !matches!(file.state, 1 | 3) {
                continue;
            }
            if let Some(bytes) = cached_bytes(
                &adapters
                    .home
                    .join("state/blobs")
                    .join(text(&file.blob_hash)),
            )? {
                if p::h("blob", &bytes) != file.blob_hash {
                    return Err(invalid(ErrorCode::InvalidData, "Cached blob hash mismatch"));
                }
                context.client.request_bytes(
                    &format!("/v1/blobs/{}", text(&file.blob_hash)),
                    "PUT",
                    &bytes,
                )?;
                blobs.push(file.blob_hash);
            }
        }
        if local_head.body.seq > remote_head.body.seq {
            let swaps = history_swaps(
                &stored,
                |hash| {
                    if let Some(value) = context.local["files"].as_str() {
                        let bytes = binary(value)?;
                        if p::h("files", &bytes) == *hash {
                            return Ok(Some(bytes));
                        }
                    }
                    cached_bytes(&adapters.home.join("state/file-lists").join(text(hash)))
                },
                remote_head.body.seq,
            )?;
            let mut bytes = Vec::new();
            p::encoding::list(&swaps, &mut bytes)?;
            context
                .client
                .request_bytes("/v1/repair/chain", "POST", &bytes)?;
        }
        if let Some(keyring) = context.local["keyring"].as_str() {
            context.client.request_bytes(
                &format!(
                    "/v1/repair/material/keyring/{}",
                    text(&local_head.body.keyring_hash)
                ),
                "PUT",
                &binary(keyring)?,
            )?;
        }
        let envelope = cached_bytes(&adapters.home.join("state/envelope.bin"))?;
        let history = read_history(&context.client, &context.vault_id, None)?;
        if let Some(envelope) = envelope {
            let hash = p::h("envelope-blob", &envelope);
            if hash == history.headers.last().expect("history").body.envelope_hash {
                context.client.request_bytes(
                    &format!("/v1/repair/material/envelope/{}", text(&hash)),
                    "PUT",
                    &envelope,
                )?;
            }
        }
        let history = read_history(&context.client, &context.vault_id, None)?;
        let head = history.headers.last().expect("history");
        let swap = crate::admin::shared::swap::admin_swap(
            &history,
            &context.identity,
            12,
            (adapters.now)(),
            vec![],
        )?;
        crate::vault::admin::commit::accept(&context, &swap, &history)?;
        blobs.sort();
        let report = p::sign_object(
            p::IRepairReport {
                vault_id: context.vault_id,
                repair_id: id,
                head: p::object_hash(head, "manifest")?,
                blobs,
                signer: context.identity.record.id,
            },
            &context.identity.keys.obj_sk,
            "repair-report",
        )?;
        context
            .client
            .request_bytes("/v1/repair/report", "PUT", &p::encode(&report)?)?;
        Ok(())
    })
}
