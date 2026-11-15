use crate::http::types::IAppOptions;
use envden_core::{
    adapters::storage::{IRestoredVault, IStateWrite, TStateKind},
    errors::Result,
};
use envden_protocol::protocol::*;

pub struct IRestoredNotice {
    pub vault_id: Vec<u8>,
    pub token: Option<String>,
    pub notice: &'static str,
}

pub fn start_restored(options: &IAppOptions) -> Result<Vec<IRestoredNotice>> {
    let storage = options.storage.as_ref();
    let mut notices = vec![];
    storage.transaction(&mut || {
        for id in storage.vault_ids()? {
            let Some(head) = storage.head(&id)? else {
                continue;
            };
            let Some(mut vault) = storage.vault(&id)? else {
                continue;
            };
            let notice = if vault.server_moved.is_some() {
                "not restored: moved to another server and read-only"
            } else if !vault.active {
                "not restored: unfinished move destination; resume or abort the move"
            } else {
                ""
            };
            if !notice.is_empty() {
                notices.push(IRestoredNotice {
                    vault_id: id,
                    token: None,
                    notice,
                });
                continue;
            }
            let secret = random_bytes();
            let restored_head = vault
                .restored
                .as_ref()
                .map_or(head, |r| r.restored_head.clone());
            vault.frozen = false;
            vault.restored = Some(IRestoredVault {
                repair_token_hash: token_key(TTokenKind::Repair, &secret).to_vec(),
                restored_head,
                finish_progress: Some(h("repair-id", &secret).to_vec()),
            });
            let mut writes = vec![IStateWrite {
                kind: TStateKind::MoveSession,
                key: vec![],
                bytes: None,
            }];
            writes.extend(
                storage
                    .states(&id, TStateKind::RepairReport)?
                    .into_iter()
                    .map(|r| IStateWrite {
                        kind: TStateKind::RepairReport,
                        key: r.key,
                        bytes: None,
                    }),
            );
            storage.configure_vault(&id, &vault, &writes, None)?;
            notices.push(IRestoredNotice {
                vault_id: id,
                token: Some(encode_token(
                    TTokenKind::Repair,
                    &secret,
                    &server_pin(&options.server_keys.public_key)?,
                )),
                notice: "",
            });
        }

        Ok(())
    })?;

    Ok(notices)
}
