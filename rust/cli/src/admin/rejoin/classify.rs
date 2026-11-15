use crate::{
    adapters::IAdapters, client::binary, identity::device_identity, state::repository::load_state,
    vault::history::IVaultHistory,
};
use envden_core::errors::{EnvdenError, ErrorCode, Result};
use envden_protocol::{chain as c, protocol as p};

pub(crate) fn check(
    adapters: &IAdapters,
    history: &IVaultHistory,
) -> Result<Option<c::TNonMember>> {
    let Some(local) = load_state(&adapters.home)?.filter(|s| s["checkpoint"].is_string()) else {
        return Ok(None);
    };
    let identity = device_identity(
        &*adapters.keychain,
        &adapters.home,
        local["deviceName"].as_str().unwrap_or_default(),
        false,
        (adapters.now)(),
    )?;
    let decode = |key: &str| -> Result<Vec<Vec<u8>>> {
        local[key]
            .as_array()
            .into_iter()
            .flatten()
            .map(|v| binary(v.as_str().unwrap_or_default()))
            .collect()
    };
    let headers = decode("headers")?
        .iter()
        .map(|b| p::decode(b))
        .collect::<Result<Vec<_>>>()?;
    let entries = decode("entries")?
        .iter()
        .map(|b| p::decode(b))
        .collect::<Result<Vec<_>>>()?;
    let result = c::classify_non_member(c::INonMemberInput {
        device_id: identity.record.id,
        stored_headers: &headers,
        stored_entries: &entries,
        verified_headers: &history.headers,
        verified_entries: &history.entries,
        state: &history.state,
    })?;
    match result {
        c::TNonMember::Fork => Err(EnvdenError::new(
            ErrorCode::Fork,
            "Rejoin history conflicts with the stored floor",
        )),
        c::TNonMember::Rollback => Err(EnvdenError::new(
            ErrorCode::Rollback,
            "Rejoin history conflicts with the stored floor",
        )),
        result => Ok(Some(result)),
    }
}

pub(crate) fn finish_identity(adapters: &IAdapters) -> Result<()> {
    let key = format!("envden/{}/rejoin/device", adapters.home.display());
    let next = adapters
        .keychain
        .get(&key, false)?
        .ok_or_else(|| EnvdenError::new(ErrorCode::InvalidData, "Missing rejoin identity"))?;
    adapters
        .keychain
        .set(&format!("envden/{}/device", adapters.home.display()), &next)?;
    adapters.keychain.delete(&key)?;
    for file in std::fs::read_dir(adapters.home.join("state")).map_err(io)? {
        let file = file.map_err(io)?;
        if file
            .file_name()
            .to_string_lossy()
            .starts_with("rejoin-floor-")
        {
            std::fs::remove_file(file.path()).map_err(io)?;
        }
    }
    Ok(())
}

fn io(cause: std::io::Error) -> EnvdenError {
    EnvdenError::with_source(ErrorCode::Internal, "Rejoin cleanup failed", cause)
}
