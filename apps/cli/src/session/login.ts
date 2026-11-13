import { EnvdenError } from "@envden/core/errors";
import {
  opaqueStartLogin,
  opaqueFinishLogin,
  unlockIdentifiers,
  MessageResponseSchema,
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

  const data: unknown = await result.json();

  if (
    !data ||
    typeof data !== "object" ||
    !("kind" in data) ||
    data.kind !== (purpose === "kit" ? "ticket" : "unlocked")
  )
    throw new EnvdenError("INVALID_DATA", "Invalid login result");

  if (
    "unlockedUntil" in data &&
    (typeof data.unlockedUntil === "number" || data.unlockedUntil === null) &&
    "freshUntil" in data &&
    typeof data.freshUntil === "number"
  )
    return { unlockedUntil: data.unlockedUntil, freshUntil: data.freshUntil };

  return undefined;
}
