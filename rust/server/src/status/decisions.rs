use envden_core::adapters::{VAULT_QUOTA_BYTES, storage::IStoredVault};

pub fn derive_server_mode(vaults: &[IStoredVault]) -> &'static str {
    if vaults.iter().any(|v| v.restored.is_some()) {
        return "restored";
    }
    if !vaults.is_empty() && vaults.iter().all(|v| v.server_moved.is_some()) {
        return "moved";
    }

    "normal"
}

pub fn derive_quota_band(usages: &[u64]) -> Option<&'static str> {
    let share = *usages.iter().max()? as f64 / VAULT_QUOTA_BYTES as f64;

    Some(if share >= 0.95 {
        "95-plus"
    } else if share >= 0.8 {
        "80-95"
    } else if share >= 0.5 {
        "50-80"
    } else {
        "below-50"
    })
}

pub fn admit_request(window: Option<(u64, usize)>, now: u64) -> Option<(u64, usize)> {
    match window {
        None => Some((now, 1)),
        Some((start, _)) if now.saturating_sub(start) >= 60000 => Some((now, 1)),
        Some((start, count)) if count < 60 => Some((start, count + 1)),
        _ => None,
    }
}
