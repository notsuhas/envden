use super::super::context::invalid;
use crate::{
    admin::shared::{context::IAdminContext, swap::admin_swap, transfer::optional_object},
    client::text,
    state::files::atomic_write,
    vault::{admin::material::current_material, history::IVaultHistory},
};
use envden_core::errors::{ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};
use std::collections::BTreeSet;

pub fn fix_lost(
    context: &IAdminContext<'_>,
    history: &IVaultHistory,
    files: p::IFiles,
    lost: &[p::IFileEntry],
    available: &BTreeSet<[u8; 32]>,
    id: &[u8; 32],
) -> Result<()> {
    let material = current_material(context, history)?;
    let mut older = Vec::new();
    for header in &history.headers {
        let bytes = optional_object(
            &context.client,
            &format!("/v1/files/{}", text(&header.body.files_hash)),
        )?;
        if bytes
            .as_ref()
            .is_some_and(|b| p::h("files", b) != header.body.files_hash)
        {
            return Err(invalid(ErrorCode::InvalidData, "File list hash mismatch"));
        }
        older.push((
            header.body.clone(),
            bytes.map(|b| p::decode(&b)).transpose()?,
        ));
    }
    let losses: BTreeSet<_> = lost.iter().map(|e| e.file_id).collect();
    let mut entries = Vec::new();
    let mut report = Vec::new();
    for file in files.entries {
        if !losses.contains(&file.file_id) {
            entries.push(file);
            continue;
        }
        let old = p::IFileContext {
            vault_id: context.vault_id,
            epoch: file.epoch,
            file_id: file.file_id,
            version: file.version,
        };
        let name = p::open_file_name(
            &file.name,
            &material.keys[&file.epoch],
            &material.ring.id_key,
            &old,
        )?;
        let next = p::IFileContext {
            epoch: material.ring.epoch,
            version: file.version + 1,
            ..old
        };
        let candidate =
            c::choose_recovery_candidate(&file.file_id, file.version, &older, available)?;
        let mut blob_hash = [0; 32];
        let mut state = 4;
        let mut result = "lost; no verified older copy".to_string();
        if let c::TRecoveryCandidate::Recovered { entry, header } = candidate
            && let Some(bytes) = optional_object(
                &context.client,
                &format!("/v1/blobs/{}", text(&entry.blob_hash)),
            )?
        {
            let old = p::IFileContext {
                epoch: entry.epoch,
                version: entry.version,
                ..old
            };
            let file = p::open_file(
                &bytes,
                &material.keys[&entry.epoch],
                &material.ring.id_key,
                &old,
                &entry.blob_hash,
                &name,
            )?;
            let blob = p::seal_file(&file, &material.key, &next, &p::random_bytes())?;
            blob_hash = p::h("blob", &blob);
            context.client.request_bytes(
                &format!("/v1/blobs/{}", text(&blob_hash)),
                "PUT",
                &blob,
            )?;
            state = 3;
            result = format!(
                "recovered from {}",
                crate::time::when_text(
                    header.created_at as i64,
                    (context.adapters.now)() as i64,
                    None
                )?
            );
        }
        report.push(format!("{}/{}: {result}", name.repo_id, name.path));
        entries.push(p::IFileEntry {
            epoch: next.epoch,
            version: next.version,
            state,
            blob_hash,
            name: p::seal_file_name(&name, &material.key, &next, &p::random_bytes())?,
            ..file
        });
    }
    let mut swap = admin_swap(
        history,
        &context.identity,
        11,
        (context.adapters.now)(),
        vec![],
    )?;
    let files = p::IFiles { entries };
    let mut body = swap.header.body;
    body.files_hash = p::h("files", &p::encode(&files)?);
    swap.header = p::sign_object(body, &context.identity.keys.obj_sk, "manifest")?;
    swap.files = Some(files);
    atomic_write(
        &context
            .adapters
            .home
            .join("state")
            .join(format!("repair-report-{}", text(id))),
        report.join("\n").as_bytes(),
        (context.adapters.now)(),
    )?;
    crate::admin::shared::submission::submit_admin(context, &swap).map(|_| ())
}
