use super::material::current_material;
use crate::{
    admin::shared::{context::IAdminContext, transfer::optional_object},
    client::text,
    vault::history::IVaultHistory,
};
use envden_core::{
    errors::{EnvdenError, ErrorCode, Result},
    merge::parse_env,
};
use envden_protocol::protocol as p;
use std::collections::BTreeSet;

pub struct IExposedFile {
    pub repo_id: String,
    pub path: String,
    pub keys: BTreeSet<String>,
}
pub struct IExposure {
    pub files: Vec<IExposedFile>,
    pub incomplete: bool,
}

pub fn exposed_names(context: &IAdminContext<'_>, history: &IVaultHistory) -> Result<IExposure> {
    let material = current_material(context, history)?;
    let mut result = IExposure {
        files: vec![],
        incomplete: false,
    };
    let mut names = Vec::new();
    let mut lists = BTreeSet::new();
    let mut blobs = BTreeSet::new();
    for header in &history.headers {
        if !lists.insert(header.body.files_hash) {
            continue;
        }
        let Some(bytes) = optional_object(
            &context.client,
            &format!("/v1/files/{}", text(&header.body.files_hash)),
        )?
        else {
            result.incomplete = true;
            continue;
        };
        if p::h("files", &bytes) != header.body.files_hash {
            return Err(EnvdenError::new(
                ErrorCode::InvalidData,
                "File list hash mismatch",
            ));
        }
        let files: p::IFiles = p::decode(&bytes)?;
        for entry in files.entries {
            if !blobs.insert(entry.blob_hash) {
                continue;
            }
            let Some(key) = material.keys.get(&entry.epoch) else {
                result.incomplete = true;
                continue;
            };
            let c = p::IFileContext {
                vault_id: context.vault_id,
                epoch: entry.epoch,
                file_id: entry.file_id,
                version: entry.version,
            };
            let Ok(name) = p::open_file_name(&entry.name, key, &material.ring.id_key, &c) else {
                result.incomplete = true;
                continue;
            };
            let index = names
                .iter()
                .position(|id| id == &entry.file_id)
                .unwrap_or_else(|| {
                    names.push(entry.file_id);
                    result.files.push(IExposedFile {
                        repo_id: name.repo_id.clone(),
                        path: name.path.clone(),
                        keys: BTreeSet::new(),
                    });
                    names.len() - 1
                });
            if ![1, 3].contains(&entry.state) {
                continue;
            }
            let Some(bytes) = optional_object(
                &context.client,
                &format!("/v1/blobs/{}", text(&entry.blob_hash)),
            )?
            else {
                result.incomplete = true;
                continue;
            };
            let file = p::open_file(
                &bytes,
                key,
                &material.ring.id_key,
                &c,
                &entry.blob_hash,
                &name,
            )?;
            match parse_env(&file.content) {
                Ok(parsed) => result.files[index]
                    .keys
                    .extend(parsed.entries.into_iter().map(|v| v.key)),
                Err(_) => result.incomplete = true,
            }
        }
    }
    Ok(result)
}

pub fn exposure_text(exposure: &IExposure) -> String {
    let mut lines = if exposure.files.is_empty() {
        vec!["This device couldn't read any env files.".into()]
    } else {
        let mut lines = vec!["This device could read:".into()];
        lines.extend(exposure.files.iter().map(|f| {
            format!(
                "  {}/{}: {}",
                f.repo_id,
                f.path,
                f.keys.iter().cloned().collect::<Vec<_>>().join(", ")
            )
        }));
        lines.push("It may have kept copies, so change these values where they're issued.".into());
        lines
    };
    if exposure.incomplete {
        lines.push("Some history couldn't be read, so this list may be incomplete.".into());
    }
    crate::output::sanitize_console(&lines.join("\n"))
}
