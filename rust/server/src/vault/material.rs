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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyring_uploads_cannot_exceed_protocol_epoch_history_size() {
        for epoch in [1, 2, 65] {
            let keyring = seal_keyring(
                &IKeyring {
                    vault_id: [0; 32],
                    epoch,
                    id_key: [0; 32],
                    older: (1..epoch)
                        .map(|epoch| IOlderKey {
                            epoch,
                            key: [0; 32],
                        })
                        .collect(),
                },
                &[0; 32],
                &[0; 24],
            )
            .unwrap();
            let header = sign_object(
                IManifestHeader {
                    vault_id: [0; 32],
                    seq: 2,
                    op: 6,
                    prev: [0; 32],
                    list_seq: 0,
                    list_head: [0; 32],
                    epoch,
                    keyring_hash: [0; 32],
                    files_hash: [0; 32],
                    envelope_hash: [0; 32],
                    created_at: 1,
                    signer: [0; 16],
                },
                &[0; 32],
                "manifest",
            )
            .unwrap();
            let mut swap = ISwap {
                expected_head: [0; 32],
                entries: vec![],
                header,
                files: None,
                keyring: Some(keyring.clone()),
                envelope: None,
                sk_pub: None,
                opaque_record: None,
                approver: None,
            };
            assert!(stored_swap(&swap, &[0; 32]).is_ok());
            swap.keyring = Some(vec![0; keyring.len() + 1]);
            assert!(stored_swap(&swap, &[0; 32]).is_err());
            if epoch == 2 {
                swap.keyring = Some(vec![0; 1024 * 1024]);
                assert!(stored_swap(&swap, &[0; 32]).is_err());
            }
        }
    }
}
