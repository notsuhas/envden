import { initializeSetup } from "../identity/setup.ts";
import { equal } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { hasProof } from "../auth/token.ts";
import { requireGate } from "../middleware/gates.ts";

export function openMove(options: IAppOptions, auth: IAuth) {
  const existing = options.storage.vault(auth.request.vaultId);
  const owner = options.storage.state(auth.request.vaultId, "move-session", new Uint8Array());

  if (existing && !existing.active && owner && equal(owner, auth.request.device))
    return { kind: "moving" };

  if (!hasProof(options, auth, "setup"))
    throw new EnvdenError("UNAUTHORIZED", "Setup proof required");

  const { storage } = options;
  const { vaultId, device } = auth.request;

  storage.transaction(() => {
    storage.configureVault(
      vaultId,
      { active: false, frozen: false, skRefused: false, unlockPeriod: 2592000000 },
      [{ kind: "move-session", key: new Uint8Array(), bytes: device }],
      storage.setupToken()!,
    );

    storage.writeState(new Uint8Array(32), [
      { kind: "server-identity", key: vaultId, bytes: vaultId },
    ]);
  });

  const token = initializeSetup(storage, options.serverKeys.publicKey);
  if (token) console.log(token);

  return { kind: "moving" };
}

export function requireMove(options: IAppOptions, auth: IAuth) {
  const { vaultId, device } = auth.request;
  const vault = options.storage.vault(vaultId);
  const owner = options.storage.state(vaultId, "move-session", new Uint8Array());

  if (!vault || vault.active || !owner || !equal(owner, device))
    throw new EnvdenError("UNAUTHORIZED", "Move session required");
}

export function freezeMove(options: IAppOptions, auth: IAuth, frozen: boolean) {
  requireGate(options, auth, "fresh");
  const { vaultId, device } = auth.request;
  const vault = options.storage.vault(vaultId)!;
  if (vault.serverMoved) throw new EnvdenError("MOVING", "Move committed");

  options.storage.configureVault(vaultId, { ...vault, frozen }, [
    { kind: "move-session", key: new Uint8Array(), ...(frozen ? { bytes: device } : {}) },
  ]);

  return { kind: frozen ? "frozen" : "unfrozen" };
}
