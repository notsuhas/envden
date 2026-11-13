import { EnvdenError } from "@envden/core/errors";
import {
  opaqueStartLogin,
  opaqueFinishLogin,
  unlockIdentifiers,
  MessageResponseSchema,
  LoginFinishResponseSchema,
} from "@envden/core/protocol";
import type { TClient } from "../client/request.ts";

export async function login(
  client: TClient,
  vaultId: Uint8Array,
  password: string,
  purpose: "unlock" | "kit" = "unlock",
) {
  const start = await opaqueStartLogin(password);

  const response = await client.request("/v1/opaque/login/start", "POST", {
    purpose,
    message: start.startLoginRequest,
  });

  const body = MessageResponseSchema.parse(await response.json());

  const finish = await opaqueFinishLogin({
    password,
    clientLoginState: start.clientLoginState,
    loginResponse: body.message,
    identifiers: unlockIdentifiers(vaultId).identifiers,
  });

  if (!finish) throw new EnvdenError("UNAUTHORIZED", "Password login failed");

  const result = await client.request("/v1/opaque/login/finish", "POST", {
    purpose,
    message: finish.finishLoginRequest,
  });

  const parsed = LoginFinishResponseSchema.safeParse(await result.json());

  if (!parsed.success || parsed.data.kind !== (purpose === "kit" ? "ticket" : "unlocked"))
    throw new EnvdenError("INVALID_DATA", "Invalid login result");

  return parsed.data.kind === "unlocked"
    ? { unlockedUntil: parsed.data.unlockedUntil, freshUntil: parsed.data.freshUntil }
    : undefined;
}
