import { verifyVaultMode } from "./mode.ts";
import type { Context } from "hono";
import type { IRequest } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { binary } from "../../http/encoding.ts";
import type { IAppOptions, TServerEnv } from "../../http/types.ts";
import { nonMemberPolicy } from "../../routes/policy.ts";

export function verifyAccess(
  c: Context<TServerEnv>,
  options: IAppOptions,
  request: IRequest,
  member: boolean,
  pathname: string,
) {
  const { storage } = options;
  const policy = nonMemberPolicy(c.req.raw.method, pathname);

  if (
    !storage.hasVault(request.vaultId) &&
    pathname !== "/v1/vault" &&
    pathname !== "/v1/move/session" &&
    policy !== "recovery" &&
    policy !== "join"
  )
    throw new EnvdenError("NOT_FOUND", "Unknown vault");

  if (!member && !policy) throw new EnvdenError("NOT_MEMBER", "Membership required");
  const proofHeader = c.req.header("Envden-Proof");

  c.set("auth", {
    request,
    member: !!member,
    ...(proofHeader ? { proof: binary(proofHeader) } : {}),
  });

  const state = storage.device(request.vaultId, request.device);

  // A joiner's own join-request polls aren't confirmation; its first request after them is.
  if (
    member &&
    (state || !pathname.startsWith("/v1/join-requests/")) &&
    state?.clientVersion !== request.clientVersion
  )
    storage.putDevice(request.vaultId, request.device, { clientVersion: request.clientVersion });

  verifyVaultMode(options, c.get("auth"), pathname);
}
