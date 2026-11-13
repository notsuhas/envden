import { completeLogin } from "./login/complete.ts";
import { MessageResponseSchema, LoginFinishResponseSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import {
  opaqueServerStartLogin,
  opaqueServerFinishLogin,
  unlockIdentifiers,
} from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { charge } from "./rate-limit.ts";

export async function startLogin(
  options: IAppOptions,
  auth: IAuth,
  purpose: "unlock" | "kit",
  message: string,
) {
  requireLoginPurpose(auth, purpose);

  const { storage, now } = options;
  const { vaultId, device } = auth.request;
  const receipt = charge(options, auth);
  const record = storage.state(vaultId, "opaqueRecord", new Uint8Array());

  const result = await opaqueServerStartLogin({
    serverSetup: options.serverKeys.opaqueSetup,
    registrationRecord: record ? Buffer.from(record).toString("base64url") : undefined,
    startLoginRequest: message,
    ...unlockIdentifiers(vaultId),
  });

  storage.putSession(
    vaultId,
    { kind: "login", device, purpose },
    new TextEncoder().encode(JSON.stringify({ state: result.serverLoginState, receipt })),
    now(),
  );

  return MessageResponseSchema.parse({ message: result.loginResponse });
}

export async function finishLogin(
  options: IAppOptions,
  auth: IAuth,
  purpose: "unlock" | "kit",
  message: string,
) {
  requireLoginPurpose(auth, purpose);

  const { storage, now } = options;
  const { vaultId, device } = auth.request;
  const bytes = storage.consumeSession(vaultId, { kind: "login", device, purpose }, now());
  if (!bytes) throw new EnvdenError("UNAUTHORIZED", "Login expired or consumed");

  const session: { state: string; receipt: string } = JSON.parse(new TextDecoder().decode(bytes));

  try {
    await opaqueServerFinishLogin({
      serverLoginState: session.state,
      finishLoginRequest: message,
      identifiers: unlockIdentifiers(vaultId).identifiers,
    });
  } catch (cause) {
    throw new EnvdenError("UNAUTHORIZED", "Login failed; vault may have moved", { cause });
  }

  storage.transaction(() => completeLogin(options, auth, purpose, session.receipt));

  if (purpose === "kit") return LoginFinishResponseSchema.parse({ kind: "ticket" });
  if (storage.vault(vaultId)?.restored) return LoginFinishResponseSchema.parse({ kind: "staged" });
  const deviceState = storage.device(vaultId, device)!;

  return LoginFinishResponseSchema.parse({
    kind: "unlocked",
    unlockedUntil: storage.vault(vaultId)?.unlockPeriod === null ? null : deviceState.unlockedUntil,
    freshUntil: deviceState.freshUntil,
  });
}

function requireLoginPurpose(auth: IAuth, purpose: "unlock" | "kit") {
  if ((purpose === "unlock") !== auth.member)
    throw new EnvdenError("NOT_MEMBER", "Invalid login purpose");
}
