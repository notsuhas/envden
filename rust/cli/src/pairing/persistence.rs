use crate::{
    adapters::IAdapters,
    client::{IClient, binary, text},
    state::{
        files::{atomic_write, optional_read},
        repository::load_state,
    },
    vault::history::read_history,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::protocol as p;

pub(super) fn clear(adapters: &IAdapters) -> Result<()> {
    adapters
        .keychain
        .delete(&format!("envden/{}/pair-receive", adapters.home.display()))?;
    for file in ["pair-pin", "pair-joiner", "pair-expiry"] {
        match std::fs::remove_file(adapters.home.join("state").join(file)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(EnvdenError::with_source(
                    ErrorCode::Internal,
                    "Pairing cleanup failed",
                    error,
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn guard(adapters: &IAdapters) -> Result<()> {
    if load_state(&adapters.home)?
        .is_some_and(|v| v.get("vaultId").is_some() && v.get("creationPending").is_none())
    {
        clear(adapters)?;
        return Err(EnvdenError::new(
            ErrorCode::Conflict,
            "Device already belongs to a vault; back up env files and remove the local envden home before joining another vault",
        ));
    }
    Ok(())
}

pub(super) fn save_approval(adapters: &IAdapters, number: u32, swap: &p::ISwap) -> Result<()> {
    atomic_write(
        &adapters.home.join("state/pair-swap"),
        format!("{number}:{}", text(&p::encode(swap)?)).as_bytes(),
        (adapters.now)(),
    )
}

pub(super) fn submit(adapters: &IAdapters, client: &IClient) -> Result<bool> {
    let path = adapters.home.join("state/pair-swap");
    let Some(saved) = optional_read(&path)? else {
        return Ok(false);
    };
    let (number, encoded) = saved
        .split_once(':')
        .ok_or_else(|| invalid("Invalid stored pairing swap"))?;
    let number: u32 = number
        .parse()
        .ok()
        .filter(|v| (1..=999).contains(v))
        .ok_or_else(|| invalid("Invalid stored pairing swap"))?;
    let bytes = binary(encoded)?;
    let swap: p::ISwap = p::decode(&bytes)?;
    let hash = p::object_hash(&swap.header, "manifest")?;
    let contains = || -> Result<bool> {
        Ok(read_history(client, &client.options.vault_id, None)?
            .headers
            .iter()
            .any(|h| p::object_hash(h, "manifest").is_ok_and(|v| v == hash)))
    };
    if !contains()? {
        client.request_bytes(&format!("/v1/swap?mailbox={number}"), "POST", &bytes)?;
    }
    if !contains()? {
        return Err(invalid("Server did not commit the pairing swap"));
    }
    std::fs::remove_file(path)
        .map_err(|e| EnvdenError::with_source(ErrorCode::Internal, "Pairing cleanup failed", e))?;
    Ok(true)
}

fn invalid(message: &'static str) -> EnvdenError {
    EnvdenError::new(ErrorCode::InvalidData, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        adapters::create_adapters,
        state::{empty_state, repository::save_state},
    };
    #[test]
    fn committed_join_refuses_and_clears_abandoned_exchange() {
        let dir = tempfile::tempdir().unwrap();
        let adapters = create_adapters(Some(dir.path().into()), dir.path().into(), || 42);
        guard(&adapters).unwrap();
        let mut state = empty_state("test");
        state["vaultId"] = "vault".into();
        save_state(&adapters.home, &state, 42).unwrap();
        atomic_write(&adapters.home.join("state/pair-pin"), b"abandoned", 42).unwrap();
        assert_eq!(guard(&adapters).unwrap_err().code, ErrorCode::Conflict);
        assert!(!adapters.home.join("state/pair-pin").exists());
        state["creationPending"] = "pending".into();
        save_state(&adapters.home, &state, 42).unwrap();
        guard(&adapters).unwrap();
    }
}
