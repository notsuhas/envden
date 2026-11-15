import { EnvdenError } from "@envden/core/errors";
import {
  opaqueStartLogin,
  opaqueFinishLogin,
  unlockIdentifiers,
  MessageResponseSchema,
  LoginFinishResponseSchema,
} from "@envden/core/protocol";
import type { TClient } from "../client/request.ts";

const TRIES = 3;

export type TPassword = string | ((retry: boolean) => Promise<string>);

type TPurpose = "unlock" | "kit";

// A prompt gets three tries at the master password; a fixed password gets one.
export async function login(
  client: TClient,
  vaultId: Uint8Array,
  password: TPassword,
  purpose: TPurpose = "unlock",
) {
  for (let attempt = 1; ; attempt++) {
    const value = typeof password === "string" ? password : await password(attempt > 1);
    const result = await attemptLogin(client, vaultId, value, purpose);

    if (result.kind === "done") return result.window;

    if (typeof password === "string" || attempt === TRIES)
      throw new EnvdenError("UNAUTHORIZED", "Wrong master password");
  }
}

async function attemptLogin(
  client: TClient,
  vaultId: Uint8Array,
  password: string,
  purpose: TPurpose,
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

  if (!finish) return { kind: "wrong-password" as const };

  const result = await client.request("/v1/opaque/login/finish", "POST", {
    purpose,
    message: finish.finishLoginRequest,
  });

  const parsed = LoginFinishResponseSchema.safeParse(await result.json());

  if (!parsed.success || parsed.data.kind !== (purpose === "kit" ? "ticket" : "unlocked"))
    throw new EnvdenError("INVALID_DATA", "Invalid login result");

  const window =
    parsed.data.kind === "unlocked"
      ? { unlockedUntil: parsed.data.unlockedUntil, freshUntil: parsed.data.freshUntil }
      : undefined;

  return { kind: "done" as const, window };
}
