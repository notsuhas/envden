use crate::{
    client::{binary, decode_history_header},
    sync::remote::context::ISyncContext,
    vault::{
        history::{ILocalHistory, IVaultHistory, read_history},
        join::decode_verified_state,
    },
};
use envden_core::errors::Result;
use envden_protocol::protocol as p;

pub fn local_history(context: &ISyncContext<'_>) -> Result<ILocalHistory> {
    let strings = |key: &str| {
        context.state[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect()
    };
    Ok(ILocalHistory {
        entries: strings("entries"),
        headers: strings("headers"),
        latest: context.state["latest"].as_str().map(str::to_owned),
        verified_state: context
            .state
            .get("verifiedState")
            .map(decode_verified_state)
            .transpose()?,
    })
}

pub(super) fn current_head(
    context: &ISyncContext<'_>,
    history: Option<IVaultHistory>,
) -> Result<(IVaultHistory, p::ISigned<p::IManifestHeader>)> {
    let raw = context.client.request("/v1/head", "GET", None)?.body;
    let local = local_history(context)?;
    let remote = match history {
        Some(history) => history,
        None => read_history(&context.client, &context.vault_id, Some(&local))?,
    };
    if let Some(head) = remote
        .headers
        .iter()
        .find(|h| p::encode(*h).is_ok_and(|bytes| bytes == raw))
        .cloned()
    {
        return Ok((remote, head));
    }
    let remote = read_history(&context.client, &context.vault_id, Some(&local))?;
    let stored = local
        .headers
        .iter()
        .map(|h| binary(h))
        .collect::<Result<Vec<_>>>()?;
    let head = decode_history_header(
        &raw,
        &remote.entries,
        &stored,
        local.latest.as_deref().unwrap_or(crate::version::VERSION),
        Some(&remote.states),
    )?;
    Ok((remote, head))
}
