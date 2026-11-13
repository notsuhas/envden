import type { Context } from "hono";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth, TServerEnv } from "../../http/types.ts";
import { authorizeRegistration } from "../../auth/proofs.ts";
import { hasProof } from "../../auth/token.ts";
import { requireJoinTicket } from "../../auth/ticket.ts";
import { requireMove } from "../../move/session.ts";
import { requireRepair } from "../../vault/authorization.ts";
import { accessible } from "../../pairing/mailbox.ts";
import { requireGate } from "../gates.ts";

export function authorizeBody(c: Context<TServerEnv>, options: IAppOptions): void {
  const auth = c.get("auth");
  const path = c.req.path;
  const vault = options.storage.vault(auth.request.vaultId);

  if (path.startsWith("/v1/opaque/registration/")) authorizeRegistration(options, auth);
  else if (path === "/v1/vault" && (!vault || !auth.member)) requireSetup(options, auth);
  else if (path.startsWith("/v1/move/")) authorizeMove(options, auth, path, c.req.method);
  else if (path.startsWith("/v1/repair/")) requireRepair(options, auth);
  else if (path.startsWith("/v1/blobs/") && c.req.method === "PUT") authorizeBlob(options, auth);
  else if (!auth.member && path === "/v1/swap") requireJoinTicket(options, auth);
  else if (
    (path === "/v1/settings/unlock-period" && c.req.method === "PUT") ||
    path === "/v1/pairing/mailboxes"
  )
    requireGate(options, auth, "fresh");
  else if (c.req.method === "PUT" && path.startsWith("/v1/pairing/mailboxes/"))
    authorizeMailbox(c, options);
}

function authorizeMailbox(c: Context<TServerEnv>, options: IAppOptions) {
  const parts = c.req.path.split("/");
  const slot = parts[5];

  if (slot === "KE1" || slot === "KE2" || slot === "KE3" || slot === "PairJoiner")
    accessible(options, c.get("auth"), Number(parts[4]), slot, true);
}

function authorizeMove(options: IAppOptions, auth: IAuth, path: string, method: string) {
  if (path === "/v1/move/session" && !options.storage.hasVault(auth.request.vaultId))
    requireSetup(options, auth);
  else if (
    ["/v1/move/freeze", "/v1/move/unfreeze", "/v1/move/sk-pub"].includes(path) ||
    (path === "/v1/move/period" && method === "GET")
  )
    requireGate(options, auth, "fresh");
  else requireMove(options, auth);
}

function authorizeBlob(options: IAppOptions, auth: IAuth) {
  const vault = options.storage.vault(auth.request.vaultId);

  if (vault?.restored) requireRepair(options, auth);
  else if (vault?.active === false) requireMove(options, auth);
  else requireGate(options, auth, "unlocked");
}

function requireSetup(options: IAppOptions, auth: IAuth) {
  if (!hasProof(options, auth, "setup"))
    throw new EnvdenError("UNAUTHORIZED", "Setup proof required");
}
