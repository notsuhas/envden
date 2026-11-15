use envden_core::errors::{EnvdenError, ErrorCode, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum TPolicy {
    Data,
    Registration,
    Kit,
    Mailbox,
    Approver,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct IRoute {
    pub limit: usize,
    pub policy: Option<TPolicy>,
    pub charge: bool,
}

pub(crate) fn request_route(method: &str, path: &str, body: bool) -> Result<IRoute> {
    use TPolicy::*;
    let parts: Vec<_> = path.split('/').collect();
    let route = match (method, path) {
        (
            "GET",
            "/"
            | "/v1/status"
            | "/v1/hello"
            | "/v1/devices"
            | "/v1/blobs"
            | "/v1/settings/unlock-period"
            | "/v1/unlock-window",
        ) => Some((0, None, false)),
        (
            "GET",
            "/v1/head" | "/v1/headers" | "/v1/entries" | "/v1/envelope" | "/v1/move/sk-pub"
            | "/v1/move/period" | "/v1/repair/status" | "/v1/repair/reports",
        ) => Some((0, Some(Data), false)),
        (
            "POST",
            "/v1/vault" | "/v1/move/discard" | "/v1/move/session" | "/v1/move/freeze"
            | "/v1/move/unfreeze" | "/v1/repair/finish",
        )
        | ("PUT", "/v1/move/period") => Some((65536, Some(Data), false)),
        (
            "POST",
            "/v1/swap" | "/v1/move/history" | "/v1/move/chain" | "/v1/repair/history"
            | "/v1/repair/chain",
        ) => Some((33554432, Some(Data), false)),
        ("POST", "/v1/opaque/login/start") => Some((65536, Some(Kit), true)),
        ("POST", "/v1/opaque/login/finish") => Some((65536, Some(Kit), false)),
        ("POST", "/v1/opaque/registration/start") => Some((65536, Some(Registration), true)),
        ("POST", "/v1/opaque/registration/finish") => Some((65536, Some(Registration), false)),
        ("GET", "/v1/pairing/approver") => Some((0, Some(Approver), false)),
        ("POST", "/v1/pairing/mailboxes") | ("PUT", "/v1/settings/unlock-period") => {
            Some((65536, None, false))
        }
        ("PUT", "/v1/repair/report") => Some((3200182, Some(Data), false)),
        _ => None,
    }
    .or_else(|| match parts.as_slice() {
        ["", "v1", "files" | "keyrings" | "blobs", value]
            if method == "GET" && !value.is_empty() =>
        {
            Some((0, Some(Data), false))
        }
        ["", "v1", "blobs", value] if method == "PUT" && !value.is_empty() => {
            Some((16777216, Some(Data), false))
        }
        ["", "v1", "move" | "repair", "material", a, b]
            if method == "PUT" && !a.is_empty() && !b.is_empty() =>
        {
            Some((33554432, Some(Data), false))
        }
        [
            "",
            "v1",
            "pairing",
            "mailboxes",
            number,
            "KE1" | "KE2" | "KE3" | "PairJoiner",
        ] if mailbox_number(number) && matches!(method, "GET" | "PUT") => Some((
            if method == "GET" { 0 } else { 65536 },
            Some(Mailbox),
            false,
        )),
        ["", "v1", "pairing", "mailboxes", number]
            if mailbox_number(number) && method == "DELETE" =>
        {
            Some((0, None, false))
        }
        _ => None,
    });
    let (limit, policy, charge) =
        route.ok_or_else(|| EnvdenError::new(ErrorCode::NotFound, "Unknown route"))?;
    if limit == 0 && body {
        return Err(EnvdenError::new(
            ErrorCode::InvalidInput,
            "Request body not allowed",
        ));
    }

    Ok(IRoute {
        limit,
        policy,
        charge,
    })
}

fn mailbox_number(value: &str) -> bool {
    value.len() <= 3
        && !value.starts_with('0')
        && !value.is_empty()
        && value.bytes().all(|b| b.is_ascii_digit())
}
