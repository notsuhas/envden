use super::{content::entry_content, context::ISyncContext};
use crate::{
    links::checkout::repo::checkout_repo,
    sync::local::{
        conflicts::conflict_records, files::read_bytes,
        reconciliation::operation::deletion::read_deletion, validation::size::file_size_notice,
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
    let rules = crate::sync::local::validation::rules::env_rules(&context.adapters.home)?;
    let applied = crate::sync::local::applied::applied_files(&context.adapters.home)?;
    let mut files = context.checkpoint.files.clone();
    let blocked = conflict_records(&context.adapters.home)?;
    let mut seen = HashSet::new();
    let mut places = places::IPlaces::default();
    let mut uploaded = Vec::new();
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
            || failed.contains(store)
            || blocked.iter().any(|r| r.store == store)
        {
            continue;
        }
        if !envden_core::adapters::accepts_env_path(path, Some(&rules)) {
            continue;
        }
        let id = p::file_id(&context.checkpoint.id_key, repo, path)?;
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
        if let Some(previous) = previous
            && !crate::sync::local::applied::has_applied_entry(
                &context.adapters.home,
                previous,
                Some(&applied),
            )?
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
        uploaded.push(next.clone());
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
    let removed = uploaded
        .iter()
        .filter(|e| matches!(e.state, 2 | 4))
        .map(|e| {
            super::content::entry_name(context, e)
                .and_then(|n| crate::store::store_path(&context.adapters.home, &n.repo_id, &n.path))
        })
        .collect::<Result<Vec<_>>>()?;
    context.state["links"]
        .as_array_mut()
        .unwrap()
        .retain(|link| {
            link["localOnly"] == true
                || !removed.iter().any(|p| link["store"].as_str() == p.to_str())
        });
    Ok(changed)
}

mod places;
mod seal;
