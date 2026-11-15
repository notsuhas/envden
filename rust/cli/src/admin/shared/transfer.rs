use crate::{
    client::{IClient, text},
    vault::history::IVaultHistory,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub fn optional_object(client: &IClient, path: &str) -> Result<Option<Vec<u8>>> {
    match client.request(path, "GET", None) {
        Ok(response) => Ok(Some(response.body)),
        Err(error) if error.code == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn history_swaps(
    history: &IVaultHistory,
    mut files: impl FnMut(&[u8; 32]) -> Result<Option<Vec<u8>>>,
    after: u64,
) -> Result<Vec<p::ISwap>> {
    let mut swaps = Vec::new();
    let mut list_seq = None;
    for header in &history.headers {
        if header.body.seq <= after {
            list_seq = Some(header.body.list_seq);
            continue;
        }
        let body = files(&header.body.files_hash)?;
        if body
            .as_deref()
            .is_some_and(|b| p::h("files", b) != header.body.files_hash)
        {
            return Err(invalid("File list hash mismatch"));
        }
        swaps.push(p::ISwap {
            expected_head: header.body.prev,
            header: header.clone(),
            entries: history
                .entries
                .iter()
                .filter(|e| {
                    list_seq.is_none_or(|seq| e.body.seq > seq)
                        && e.body.seq <= header.body.list_seq
                })
                .cloned()
                .collect(),
            files: body.map(|b| p::decode(&b)).transpose()?,
            keyring: None,
            envelope: None,
            sk_pub: None,
            opaque_record: None,
            approver: None,
        });
        list_seq = Some(header.body.list_seq);
    }
    Ok(swaps)
}

pub fn copy_server(source: &IClient, destination: &IClient, history: &IVaultHistory) -> Result<()> {
    let hashes: p::IObjectsResponse =
        serde_json::from_value(source.request("/v1/blobs", "GET", None)?.json()?).map_err(|e| {
            EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", e)
        })?;
    for hash in hashes.objects {
        let bytes = optional_object(source, &format!("/v1/blobs/{hash}"))?
            .ok_or_else(|| invalid("Move blob hash mismatch"))?;
        if text(&p::h("blob", &bytes)) != hash {
            return Err(invalid("Move blob hash mismatch"));
        }
        destination.request_bytes(&format!("/v1/blobs/{hash}"), "PUT", &bytes)?;
    }
    let swaps = history_swaps(
        history,
        |hash| optional_object(source, &format!("/v1/files/{}", text(hash))),
        0,
    )?;
    let mut chain = Vec::new();
    p::encoding::list(&swaps, &mut chain)?;
    destination.request_bytes("/v1/move/chain", "POST", &chain)?;
    for header in &history.headers {
        let hash = text(&header.body.keyring_hash);
        if let Some(bytes) = optional_object(source, &format!("/v1/keyrings/{hash}"))? {
            destination.request_bytes(
                &format!("/v1/move/material/keyring/{hash}"),
                "PUT",
                &bytes,
            )?;
        }
    }
    let head = &history.headers.last().expect("verified history").body;
    let envelope = optional_object(source, "/v1/envelope")?
        .ok_or_else(|| invalid("Move envelope hash mismatch"))?;
    if p::h("envelope-blob", &envelope) != head.envelope_hash {
        return Err(invalid("Move envelope hash mismatch"));
    }
    destination.request_bytes(
        &format!("/v1/move/material/envelope/{}", text(&head.envelope_hash)),
        "PUT",
        &envelope,
    )?;
    let sk_pub = optional_object(source, "/v1/move/sk-pub")?
        .ok_or_else(|| invalid("Missing secret key public key"))?;
    destination.request_bytes(
        &format!(
            "/v1/move/material/skPub/{}",
            text(&p::h("sk-public", &sk_pub))
        ),
        "PUT",
        &sk_pub,
    )?;
    let period: p::IUnlockPeriod = serde_json::from_value(
        source.request("/v1/move/period", "GET", None)?.json()?,
    )
    .map_err(|e| EnvdenError::with_source(ErrorCode::InvalidData, "Invalid server response", e))?;
    destination.request(
        "/v1/move/period",
        "PUT",
        Some(&serde_json::to_value(period).expect("period JSON")),
    )?;
    Ok(())
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}
