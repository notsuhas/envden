use crate::{
    client::{binary, text},
    state::{
        files::{atomic_write, failure},
        records::recover_sync_record,
    },
    store::store_path,
    sync::{
        local::{
            applied::{applied_files, save_applied_files},
            files::{base_path, write_bytes},
            reconciliation::operation::deletion::{read_deletion, request_deletion, suffix},
        },
        remote::{
            content::{entry_content, entry_name},
            context::ISyncContext,
        },
    },
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Serialize, Deserialize)]
struct IAttempt {
    header: String,
    sequence: String,
    places: Vec<String>,
    entries: Vec<String>,
}

pub fn save_attempt(
    context: &ISyncContext<'_>,
    entries: &[p::IFileEntry],
    header: &p::ISigned<p::IManifestHeader>,
    places: Vec<String>,
) -> Result<()> {
    let document = serde_json::to_string(&IAttempt {
        header: text(&p::object_hash(header, "manifest")?),
        sequence: header.body.seq.to_string(),
        places,
        entries: entries
            .iter()
            .map(|e| p::encode(e).map(|b| text(&b)))
            .collect::<Result<_>>()?,
    })
    .unwrap();
    let receipt = text(&Sha256::digest(document.as_bytes()));
    atomic_write(
        &context.adapters.home.join("state/attempts").join(receipt),
        document.as_bytes(),
        (context.options.now)(),
    )
}

pub fn acknowledge(context: &ISyncContext<'_>) -> Result<()> {
    let directory = context.adapters.home.join("state/attempts");
    let names = match fs::read_dir(&directory) {
        Ok(names) => names,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(failure(e)),
    };
    let mut attempts = Vec::new();
    for name in names {
        let name = name
            .map_err(failure)?
            .file_name()
            .to_string_lossy()
            .into_owned();
        let receipt = name.trim_end_matches(".invalid");
        if receipt.len() != 43
            || !receipt
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        {
            continue;
        }
        let path = directory.join(receipt);
        let marker = suffix(&path, ".invalid");
        let record = if name.ends_with(".invalid") {
            None
        } else {
            recover_sync_record(
                &path,
                &marker,
                |saved| decode(saved, receipt),
                (context.options.now)(),
                |m| {
                    if let Some(report) = &context.options.report {
                        report(m);
                    }
                },
            )?
        };
        if let Some(record) = record {
            attempts.push((path, record));
        } else {
            for link in context.state["links"].as_array().into_iter().flatten() {
                atomic_write(
                    &suffix(
                        &base_path(
                            &context.adapters.home,
                            link["store"].as_str().unwrap_or_default(),
                            None,
                        ),
                        ".corrupt",
                    ),
                    path.to_string_lossy().as_bytes(),
                    (context.options.now)(),
                )?;
            }
            write_bytes(&marker, None, (context.options.now)())?;
        }
    }
    attempts.sort_by_key(|(_, a)| a.sequence.parse::<u64>().unwrap_or_default());
    for (path, attempt) in attempts {
        let accepted = context
            .headers
            .iter()
            .any(|h| p::object_hash(h, "manifest").is_ok_and(|h| text(&h) == attempt.header));
        if accepted {
            apply(context, &attempt)?;
        }
        if accepted
            || context.checkpoint.header.body.seq
                >= attempt.sequence.parse::<u64>().unwrap_or_default()
        {
            write_bytes(&path, None, (context.options.now)())?;
        }
    }
    Ok(())
}

fn decode(saved: &str, receipt: &str) -> Result<IAttempt> {
    let invalid = || EnvdenError::new(ErrorCode::InvalidData, "Invalid attempt record");
    if text(&Sha256::digest(saved.as_bytes())) != receipt {
        return Err(invalid());
    }
    let record: IAttempt = serde_json::from_str(saved).map_err(|_| invalid())?;
    if record.header.len() != 43
        || record.sequence.len() > 20
        || record.sequence.parse::<u64>().is_err()
    {
        return Err(invalid());
    }
    for entry in &record.entries {
        let _: p::IFileEntry = p::decode(&binary(entry)?)?;
    }
    Ok(record)
}

fn apply(context: &ISyncContext<'_>, attempt: &IAttempt) -> Result<()> {
    let mut applied = applied_files(&context.adapters.home)?;
    let now = (context.options.now)();
    for encoded in &attempt.entries {
        let entry: p::IFileEntry = p::decode(&binary(encoded)?)?;
        let name = entry_name(context, &entry)?;
        let store = store_path(&context.adapters.home, &name.repo_id, &name.path)?
            .to_string_lossy()
            .into_owned();
        let content = entry_content(context, &entry)?;
        let base = base_path(&context.adapters.home, &store, None);
        for place in &attempt.places {
            if Path::new(place) == base
                || context.state["links"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|l| {
                        l["store"] == store
                            && l["mode"] == "copy"
                            && Path::new(place)
                                == base_path(&context.adapters.home, &store, l["root"].as_str())
                    })
            {
                write_bytes(Path::new(place), content.as_deref(), now)?;
            }
        }
        atomic_write(&suffix(&base, ".entry"), encoded.as_bytes(), now)?;
        applied.insert(p::base32(&entry.file_id), encoded.clone().into());
        if read_deletion(&context.adapters.home, &store, now)?.is_some() {
            request_deletion(
                &context.adapters.home,
                &store,
                content.is_some(),
                Some(encoded),
                None,
                now,
            )?;
        }
    }
    save_applied_files(&context.adapters.home, applied, now)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_tampered_receipts_and_invalid_sequences() {
        let document = r#"{"header":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","sequence":"2","places":[],"entries":[]}"#;
        let receipt = text(&Sha256::digest(document.as_bytes()));
        assert_eq!(decode(document, &receipt).unwrap().sequence, "2");
        assert!(decode(&document.replace('2', "3"), &receipt).is_err());
        let invalid = document.replace("\"2\"", "\"-1\"");
        assert!(decode(&invalid, &text(&Sha256::digest(invalid.as_bytes()))).is_err());
    }
}
