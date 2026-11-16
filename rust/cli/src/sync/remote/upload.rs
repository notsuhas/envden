use super::{content::entry_content, context::ISyncContext};
use crate::{
    links::checkout::repo::checkout_repo,
    sync::local::{
        files::read_bytes, reconciliation::operation::deletion::read_deletion,
        validation::size::file_size_notice,
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;
use std::{collections::HashSet, path::Path};

pub fn upload_changes(
    context: &mut ISyncContext<'_>,
    repos: &HashSet<String>,
    failed: &HashSet<String>,
) -> Result<usize> {
    let mut files = context.checkpoint.files.clone();
    let mut seen = HashSet::new();
    let mut places = places::IPlaces::default();
    let blocked = super::attempt::blocked::blocked_stores(context, failed)?;
    super::attempt::notices::report_blocked(context)?;
    for link in context.state["links"].as_array().into_iter().flatten() {
        let root = link["root"].as_str().unwrap_or_default();
        let path = link["path"].as_str().unwrap_or_default();
        let store = link["store"].as_str().unwrap_or_default();
        let Some(repo) = checkout_repo(&context.state, root) else {
            continue;
        };
        if link["localOnly"] == true
            || !repos.contains(repo)
            || context.skipped_roots.contains(root)
            || blocked.contains(store)
        {
            continue;
        }
        let id = p::file_id(&context.checkpoint.id_key, repo, path)?;
        let mode = if link["mode"] == "copy" {
            envden_core::adapters::TPlacementMode::Copy
        } else {
            envden_core::adapters::TPlacementMode::Link
        };
        let status = context
            .adapters
            .placement(mode, Path::new(root))
            .inspect(store, &Path::new(root).join(path).to_string_lossy())?;
        if mode == envden_core::adapters::TPlacementMode::Link
            && status == envden_core::adapters::TPlacementState::Detached
        {
            return Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::Conflict,
                "Detached checkout; resolve local content before pushing",
            ));
        }
        let bytes = read_bytes(Path::new(store))?;
        if let Some(notice) = file_size_notice(path, bytes.as_deref()) {
            if let Some(report) = &context.options.report {
                report(&notice);
            }
            continue;
        }
        let previous = context
            .checkpoint
            .files
            .entries
            .iter()
            .find(|e| e.file_id == id);
        if bytes.is_none()
            && (previous.is_none()
                || read_deletion(&context.adapters.home, store, (context.options.now)())?.is_none())
        {
            continue;
        }
        let baseline = previous
            .map(|e| entry_content(context, e))
            .transpose()?
            .flatten();
        if bytes == baseline {
            continue;
        }
        places.record(
            &context.adapters.home,
            store,
            if link["mode"] == "copy" {
                Some(root)
            } else {
                None
            },
            bytes.is_none(),
        );
        if !seen.insert(id) {
            continue;
        }
        let next = seal::seal(
            context,
            repo,
            path,
            id,
            previous.map_or(1, |e| e.version + 1),
            bytes.as_deref(),
        )?;
        match files.entries.iter().position(|e| e.file_id == id) {
            Some(index) => files.entries[index] = next,
            None => files.entries.push(next),
        }
    }
    let changed = places.count();
    if changed == 0 {
        return Ok(0);
    }
    files.entries.sort_by_key(|e| e.file_id);
    let uploaded = files
        .entries
        .iter()
        .filter(|entry| seen.contains(&entry.file_id))
        .cloned()
        .collect::<Vec<_>>();
    let expected = p::object_hash(&context.checkpoint.header, "manifest")?;
    let mut body = context.checkpoint.header.body.clone();
    body.seq += 1;
    body.prev = expected;
    body.signer = context.identity.record.id;
    body.op = 1;
    body.files_hash = p::h("files", &p::encode(&files)?);
    body.created_at = (context.options.now)();
    let header = p::sign_object(body, &context.identity.keys.obj_sk, "manifest")?;
    let swap = p::ISwap {
        expected_head: expected,
        header: header.clone(),
        files: Some(files.clone()),
        entries: vec![],
        keyring: None,
        envelope: None,
        sk_pub: None,
        opaque_record: None,
        approver: None,
    };
    super::attempt::record::save_attempt(context, &uploaded, &header, places.receipts())?;
    context
        .client
        .request_bytes("/v1/swap", "POST", &p::encode(&swap)?)?;
    context.checkpoint.header = header.clone();
    context.checkpoint.files = files;
    context.headers.push(header);
    super::attempt::record::acknowledge(context)?;
    context.state["links"]
        .as_array_mut()
        .unwrap()
        .retain(|link| retention::keep_link(link, &places, &context.adapters.home));
    Ok(changed)
}

mod places;
mod seal;

mod retention;

#[cfg(test)]
mod tests;
