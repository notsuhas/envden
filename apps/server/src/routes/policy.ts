export function nonMemberPolicy(
  method: string,
  path: string,
): "data" | "registration" | "kit" | "mailbox" | "approver" | undefined {
  if (
    /^\/v1\/(vault|swap|head|headers|entries|files\/[^/]+|keyrings\/[^/]+|envelope|move\/.*|repair\/.*|blobs\/[^/]+)$/.test(
      path,
    )
  )
    return "data";

  if (method === "POST" && /^\/v1\/opaque\/registration\/(start|finish)$/.test(path))
    return "registration";

  if (method === "POST" && /^\/v1\/opaque\/login\/(start|finish)$/.test(path)) return "kit";

  if (
    ["GET", "PUT"].includes(method) &&
    /^\/v1\/pairing\/mailboxes\/[1-9][0-9]{0,2}\/(KE1|KE2|KE3|PairJoiner)$/.test(path)
  )
    return "mailbox";

  if (method === "GET" && path === "/v1/pairing/approver") return "approver";

  return undefined;
}
