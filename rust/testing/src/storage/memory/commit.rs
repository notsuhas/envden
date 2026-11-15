use super::data::*;
use envden_core::{adapters::*, errors::Result};
impl IMemory {
    pub(super) fn commit_inner(
        &self,
        vault_id: &[u8],
        expected_head: Option<&[u8]>,
        swap: &IStoredSwap,
        now: u64,
    ) -> Result<TCommitResult> {
        if self.find_committed(vault_id, &swap.body_digest)? {
            return Ok(TCommitResult::RetryOfCommitted);
        }
        let head = self.head(vault_id)?;
        if head.as_deref() != expected_head {
            return Ok(TCommitResult::HeadMoved { head });
        }
        if let Some(hash) = &swap.setup_token_hash
            && self.setup_token()?.as_ref() != Some(hash)
        {
            return Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::Unauthorized,
                "Setup token changed or consumed",
            ));
        }
        for session in swap.consume_sessions.as_deref().unwrap_or_default() {
            if self.consume_session(vault_id, session, now)?.is_none() {
                return Err(envden_core::errors::EnvdenError::new(
                    envden_core::errors::ErrorCode::Unauthorized,
                    "Session expired or consumed",
                ));
            }
        }
        if let Some(number) = swap.close_mailbox
            && self.mailbox(vault_id, number, now)?.is_none()
        {
            return Err(envden_core::errors::EnvdenError::new(
                envden_core::errors::ErrorCode::NotFound,
                "Mailbox expired or closed",
            ));
        }
        if let Some(vault) = &swap.vault {
            self.configure_vault(vault_id, vault, &[], None)?;
        }
        if !self.has_vault(vault_id)? {
            return Err(fail("Creation requires vault metadata"));
        }
        let guard = self.data.lock();
        let mut d = guard.borrow_mut();
        let headers = d.headers.entry(vault_id.to_vec()).or_default();
        if headers
            .iter()
            .any(|h| h.seq == swap.header.seq || h.hash == swap.header.hash)
        {
            return Err(fail("Duplicate header"));
        }
        if swap.header.seq > 9007199254740991 {
            return Err(fail("Invalid sequence"));
        }
        if let Some(files) = &swap.files {
            let key = pair(vault_id, &files.hash);
            let permanent = d.lists.get(&key).is_some_and(|(_, _, p)| *p)
                || files.retain_forever.unwrap_or(false);
            d.lists.insert(key, (files.clone(), now, permanent));
            if files.retain_forever.unwrap_or(false)
                && let Some(current) = d.current.get(vault_id).cloned()
                && let Some((_, _, p)) = d.lists.get_mut(&pair(vault_id, &current))
            {
                *p = true;
            }
            d.current.insert(vault_id.to_vec(), files.hash.clone());
        }
        if let Some(current) = d.current.get(vault_id).cloned()
            && let Some((_, at, _)) = d.lists.get_mut(&pair(vault_id, &current))
        {
            *at = now;
        }
        d.headers
            .get_mut(vault_id)
            .unwrap()
            .push(swap.header.clone());
        let entries = d.entries.entry(vault_id.to_vec()).or_default();
        for e in &swap.entries {
            if entries.iter().any(|p| p.seq == e.seq || p.hash == e.hash) {
                return Err(fail("Duplicate entry"));
            }
            entries.push(e.clone());
        }
        for write in swap.state.as_deref().unwrap_or_default() {
            let key = (vault_id.to_vec(), write.kind, write.key.clone());
            if let Some(bytes) = &write.bytes {
                d.states.insert(key, bytes.clone());
            } else {
                d.states.shift_remove(&key);
            }
        }
        for device in swap.devices.as_deref().unwrap_or_default() {
            d.devices
                .insert(pair(vault_id, &device.id), device.state.clone());
        }
        if let Some(approver) = &swap.approver {
            d.approvers.insert(
                pair(vault_id, &approver.device),
                (approver.bytes.clone(), now + 86400000),
            );
        }
        if swap.clear_repair_reports.unwrap_or(false) {
            d.states
                .retain(|(v, k, _), _| v != vault_id || *k != TStateKind::RepairReport);
        }
        if let Some(number) = swap.close_mailbox
            && d.mailboxes.get(&number).is_some_and(|(v, _)| v == vault_id)
        {
            d.mailboxes.shift_remove(&number);
        }
        if swap.setup_token_hash.is_some() {
            d.setup = None;
        }
        d.digests.insert(pair(vault_id, &swap.body_digest));
        d.heads.insert(vault_id.to_vec(), swap.header.hash.clone());
        Ok(TCommitResult::Committed)
    }
}
