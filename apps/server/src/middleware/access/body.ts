import { chargeJoinWrite } from "../../join/rate-limit.ts";
import { authorizeNonMember } from "./non-member.ts";
import type { Context } from "hono";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth, TServerEnv } from "../../http/types.ts";
import { hasProof } from "../../auth/token.ts";
import { requireJoinTicket } from "../../auth/ticket.ts";
import { requireMove } from "../../move/session.ts";
import { requireRepair } from "../../vault/authorization.ts";
import { accessJoinRequest } from "../../join/requests.ts";
import { requireMember } from "../member.ts";

export function authorizeBody(c: Context<TServerEnv>, options: IAppOptions): void {
  const auth = c.get("auth");
  const path = c.req.path;
  const vault = options.storage.vault(auth.request.vaultId);

  authorizeNonMember(c, options);

  if (path === "/v1/vault" && (!vault || !auth.member)) requireSetup(options, auth);
  else if (path.startsWith("/v1/move/")) authorizeMove(options, auth, path);
  else if (path.startsWith("/v1/repair/")) requireRepair(options, auth);
  else if (path.startsWith("/v1/blobs/") && c.req.method === "PUT") authorizeBlob(options, auth);
  else if (!auth.member && path === "/v1/swap") requireJoinTicket(options, auth);
  else if (c.req.method === "PUT" && path.startsWith("/v1/join-requests/"))
    authorizeJoinWrite(c, options);
}

function authorizeJoinWrite(c: Context<TServerEnv>, options: IAppOptions) {
  const parts = c.req.path.split("/");
  const slot = parts[4];
  const number = Number(parts[3]);

  if (slot === "offer" || slot === "reveal")
    chargeJoinWrite(options, c.get("auth"), number, () =>
      accessJoinRequest(options, c.get("auth"), number, { kind: "write", slot }),
    );
}

function authorizeMove(options: IAppOptions, auth: IAuth, path: string) {
  if (path === "/v1/move/session" && !options.storage.hasVault(auth.request.vaultId))
    requireSetup(options, auth);
  else if (["/v1/move/freeze", "/v1/move/unfreeze", "/v1/move/proof-pub"].includes(path))
    requireMember(auth);
  else requireMove(options, auth);
}

function authorizeBlob(options: IAppOptions, auth: IAuth) {
  const vault = options.storage.vault(auth.request.vaultId);

  if (vault?.restored) requireRepair(options, auth);
  else if (vault?.active === false) requireMove(options, auth);
  else requireMember(auth);
}

function requireSetup(options: IAppOptions, auth: IAuth) {
  if (!hasProof(options, auth, "setup"))
    throw new EnvdenError("UNAUTHORIZED", "Setup proof required");
}
