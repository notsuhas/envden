import { EnvdenError } from "@envden/core/errors";
import type { Context } from "hono";
import type { IAppOptions, TServerEnv } from "../../http/types.ts";
import { requireRead } from "../../vault/access.ts";
import { binary } from "../../http/encoding.ts";
import { accessible, fetchApprover } from "../../pairing/mailbox.ts";

export function authorizeNonMember(c: Context<TServerEnv>, options: IAppOptions) {
  const auth = c.get("auth");
  if (auth.member) return;
  const path = c.req.path;
  const { vaultId, device } = auth.request;

  if (
    path === "/v1/opaque/login/finish" &&
    !options.storage.session(vaultId, { kind: "login", device, purpose: "kit" }, options.now())
  )
    throw new EnvdenError("UNAUTHORIZED", "Login expired or consumed");

  if (c.req.method === "GET") authorizeRead(c, options);
}

function authorizeRead(c: Context<TServerEnv>, options: IAppOptions) {
  const path = c.req.path;
  const auth = c.get("auth");

  if (["/v1/head", "/v1/headers", "/v1/entries", "/v1/envelope"].includes(path))
    requireRead(options, auth, path === "/v1/envelope" ? "envelope" : "history");

  const match = /^\/v1\/(files|keyrings|blobs)\/([^/]+)$/.exec(path);

  if (match)
    requireRead(
      options,
      auth,
      match[1] === "files" ? "files" : match[1] === "keyrings" ? "keyring" : "blob",
      binary(match[2], 32),
    );

  if (path === "/v1/pairing/approver") fetchApprover(options, auth);
  authorizeMailboxRead(c, options);
}

function authorizeMailboxRead(c: Context<TServerEnv>, options: IAppOptions) {
  const path = c.req.path;
  const auth = c.get("auth");
  const parts = path.split("/");
  const slot = parts[5];

  if (
    path.startsWith("/v1/pairing/mailboxes/") &&
    (slot === "KE1" || slot === "KE2" || slot === "KE3" || slot === "PairJoiner")
  )
    accessible(options, auth, Number(parts[4]), slot, false);
}
