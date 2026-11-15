use envden_core::{
    adapters::storage::*,
    errors::{EnvdenError, ErrorCode, Result},
};
use envden_protocol::protocol::*;

pub(crate) fn stored_swap(swap: &ISwap, digest: &[u8]) -> Result<IStoredSwap> {
    let header = &swap.header.body;
    let limit = 115 + 36 * (header.epoch.saturating_sub(1) as usize);
    if swap.keyring.as_ref().is_some_and(|k| k.len() > limit) {
        return Err(EnvdenError::new(
            ErrorCode::InvalidData,
            "Keyring exceeds epoch history size",
        ));
    }
    let mut state = vec![];
    for (kind, key, bytes) in [
        (
            TStateKind::Keyring,
            header.keyring_hash.to_vec(),
            swap.keyring.clone(),
        ),
        (TStateKind::Envelope, vec![], swap.envelope.clone()),
        (TStateKind::SkPub, vec![], swap.sk_pub.map(|v| v.to_vec())),
        (TStateKind::OpaqueRecord, vec![], swap.opaque_record.clone()),
    ] {
        if bytes.is_some() {
            state.push(IStateWrite { kind, key, bytes });
        }
    }
    let files = swap
        .files
        .as_ref()
        .map(|files| -> Result<IStoredFiles> {
            let bytes = encode(files)?;

            Ok(IStoredFiles {
                hash: h("files", &bytes).to_vec(),
                bytes,
                retain_forever: Some(header.op == 11),
                versions: files
                    .entries
                    .iter()
                    .map(|e| IFileVersion {
                        file_id: e.file_id.to_vec(),
                        version: e.version,
                        blob_hash: if matches!(e.state, 1 | 3) {
                            Some(e.blob_hash.to_vec())
                        } else {
                            None
                        },
                        tombstone: matches!(e.state, 2 | 4),
                    })
                    .collect(),
            })
        })
        .transpose()?;

    Ok(IStoredSwap {
        header: IStoredHeader {
            hash: object_hash(&swap.header, "manifest")?.to_vec(),
            bytes: encode(&swap.header)?,
            seq: header.seq,
        },
        entries: swap
            .entries
            .iter()
            .map(|entry| {
                Ok(IStoredHeader {
                    hash: object_hash(entry, "entry")?.to_vec(),
                    bytes: encode(entry)?,
                    seq: entry.body.seq,
                })
            })
            .collect::<Result<_>>()?,
        files_hash: Some(header.files_hash.to_vec()),
        files,
        body_digest: digest.to_vec(),
        state: Some(state),
        vault: None,
        devices: None,
        approver: None,
        consume_sessions: None,
        close_mailbox: None,
        setup_token_hash: None,
        clear_repair_reports: None,
    })
}
