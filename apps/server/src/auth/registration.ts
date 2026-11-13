import { EnvdenError } from "@envden/core/errors";
import { opaqueRegistrationResponse, unlockIdentifiers, equal } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { binary } from "../http/encoding.ts";
import { authorizeRegistration } from "./proofs.ts";
import { hasProof } from "./token.ts";
import { charge } from "./rate-limit.ts";

export async function startRegistration(options: IAppOptions, auth: IAuth, message: string) {
  authorizeRegistration(options, auth);

  const receipt = charge(options, auth);

  const token = hasProof(options, auth, "setup")
    ? options.storage.setupToken()
    : options.storage.vault(auth.request.vaultId)?.restored?.repairTokenHash;

  if (token)
    options.storage.putSession(
      auth.request.vaultId,
      { kind: "login", device: auth.request.device, purpose: "registration-authority" },
      token,
      options.now(),
    );

  const result = await opaqueRegistrationResponse({
    serverSetup: options.serverKeys.opaqueSetup,
    userIdentifier: unlockIdentifiers(auth.request.vaultId).userIdentifier,
    registrationRequest: message,
  });

  options.storage.putSession(
    auth.request.vaultId,
    { kind: "login", device: auth.request.device, purpose: "registration" },
    new TextEncoder().encode(receipt),
    options.now(),
  );

  return { message: result.registrationResponse };
}

export function finishRegistration(options: IAppOptions, auth: IAuth, message: string) {
  authorizeRegistration(options, auth);

  const { vaultId, device } = auth.request;

  const token = hasProof(options, auth, "setup")
    ? options.storage.setupToken()
    : options.storage.vault(vaultId)?.restored?.repairTokenHash;

  if (token) {
    const authority = options.storage.session(
      vaultId,
      { kind: "login", device, purpose: "registration-authority" },
      options.now(),
    );

    if (!authority || !equal(authority, token))
      throw new EnvdenError("UNAUTHORIZED", "Registration token changed");
  }

  const receipt = options.storage.consumeSession(
    vaultId,
    { kind: "login", device, purpose: "registration" },
    options.now(),
  );

  if (!receipt) throw new EnvdenError("UNAUTHORIZED", "Registration expired or consumed");

  options.storage.transaction(() => {
    options.storage.putSession(
      vaultId,
      { kind: "login", device, purpose: "registration-record" },
      binary(message),
      options.now(),
    );

    if (options.storage.vault(vaultId)?.active === false)
      options.storage.writeState(vaultId, [
        {
          kind: "move-session",
          key: new TextEncoder().encode("registration"),
          bytes: binary(message),
        },
      ]);

    const restored = options.storage.vault(vaultId)?.restored;

    if (restored)
      options.storage.putSession(
        vaultId,
        { kind: "login", device, purpose: "registration-repair" },
        restored.repairTokenHash,
        options.now(),
      );

    options.storage.refund(new TextDecoder().decode(receipt), options.now());
  });

  return { kind: "registered" };
}
