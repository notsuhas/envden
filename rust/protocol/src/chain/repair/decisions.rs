use crate::protocol::*;
use envden_core::errors::Result;
use std::collections::BTreeSet;

pub enum TRecoveryCandidate {
    Recovered {
        entry: IFileEntry,
        header: Box<IManifestHeader>,
    },
    Lost,
}

pub fn choose_recovery_candidate(
    file_id: &[u8; 32],
    before_version: u64,
    history: &[(IManifestHeader, Option<IFiles>)],
    available: &BTreeSet<[u8; 32]>,
) -> Result<TRecoveryCandidate> {
    let mut history: Vec<_> = history.iter().collect();
    history.sort_by_key(|a| std::cmp::Reverse(a.0.seq));
    for (header, files) in history {
        let Some(files) = files else {
            return Ok(TRecoveryCandidate::Lost);
        };
        if h("files", &encode(files)?) != header.files_hash {
            return Ok(TRecoveryCandidate::Lost);
        }
        let Some(e) = files
            .entries
            .iter()
            .find(|e| e.file_id == *file_id && e.version < before_version)
        else {
            continue;
        };
        if [2, 4].contains(&e.state) {
            return Ok(TRecoveryCandidate::Lost);
        }
        if available.contains(&e.blob_hash) {
            return Ok(TRecoveryCandidate::Recovered {
                entry: e.clone(),
                header: Box::new(header.clone()),
            });
        }
    }
    Ok(TRecoveryCandidate::Lost)
}

pub fn repair_login_decision(headers: &[IManifestHeader]) -> &'static str {
    if headers.iter().any(|h| [8, 9].contains(&h.op)) {
        "register"
    } else {
        "login"
    }
}

pub fn refuse_secret_key_proof(headers: &[IManifestHeader], envelope_matches_head: bool) -> bool {
    !envelope_matches_head || headers.iter().any(|h| [5, 7].contains(&h.op))
}

pub fn is_reused_repair_token(id: &[u8; 32], ids: &BTreeSet<[u8; 32]>) -> bool {
    ids.contains(id)
}
