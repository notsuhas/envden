use super::{content::entry_content, context::ISyncContext};
use crate::{
    client::text,
    links::checkout::repo::checkout_repo,
    state::files::atomic_write,
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
    let mut changed = 0;
    let mut places = Vec::new();
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
        if !seen.insert(id) {
            continue;
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
        let next = seal(
            context,
            repo,
            path,
            id,
            previous.map_or(1, |e| e.version + 1),
            bytes.as_deref(),
        )?;
        uploaded.push(next.clone());
        places.push(
            crate::sync::local::files::base_path(&context.adapters.home, store, None)
                .to_string_lossy()
                .into_owned(),
        );
        if link["mode"] == "copy" {
            places.push(
                crate::sync::local::files::base_path(&context.adapters.home, store, Some(root))
                    .to_string_lossy()
                    .into_owned(),
            );
        }
        match files.entries.iter().position(|e| e.file_id == id) {
            Some(index) => files.entries[index] = next,
            None => files.entries.push(next),
        }
        changed += 1;
    }
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
    super::attempt::record::save_attempt(context, &uploaded, &header, places)?;
    context
        .client
        .request_bytes("/v1/swap", "POST", &p::encode(&swap)?)?;
    context.checkpoint.header = header.clone();
    context.checkpoint.files = files;
    context.headers.push(header);
    super::attempt::record::acknowledge(context)?;
    Ok(changed)
}

fn seal(
    context: &ISyncContext<'_>,
    repo: &str,
    path: &str,
    id: [u8; 32],
    version: u64,
    bytes: Option<&[u8]>,
) -> Result<p::IFileEntry> {
    let epoch = context.checkpoint.header.body.epoch;
    let key = &context.keys[&epoch];
    let c = p::IFileContext {
        vault_id: context.vault_id,
        epoch,
        file_id: id,
        version,
    };
    let name = p::IFileName {
        repo_id: repo.into(),
        path: path.into(),
    };
    let mut hash = [0; 32];
    if let Some(bytes) = bytes {
        let blob = p::seal_file(
            &p::IFile {
                repo_id: repo.into(),
                path: path.into(),
                content: bytes.to_vec(),
            },
            key,
            &c,
            &p::random_bytes::<24>(),
        )?;
        hash = p::h("blob", &blob);
        context
            .client
            .request_bytes(&format!("/v1/blobs/{}", text(&hash)), "PUT", &blob)?;
        atomic_write(
            &context.adapters.home.join("state/blobs").join(text(&hash)),
            &blob,
            (context.options.now)(),
        )?;
    }
    Ok(p::IFileEntry {
        file_id: id,
        epoch,
        version,
        state: if bytes.is_some() { 1 } else { 2 },
        blob_hash: hash,
        name: p::seal_file_name(&name, key, &c, &p::random_bytes::<24>())?,
    })
}
