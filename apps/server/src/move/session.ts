import { equal } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { hasProof } from "../auth/token.ts";
import { requireMember } from "../middleware/member.ts";

export function openMove(options: IAppOptions, auth: IAuth) {
  if (auth.request.vaultId.every((byte) => byte === 0))
    throw new EnvdenError("INVALID_INPUT", "Invalid vault ID");

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
      { active: false, frozen: false, proofRefused: false },
      [{ kind: "move-session", key: new Uint8Array(), bytes: device }],
      storage.setupToken()!,
    );
  });

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
  requireMember(auth);
  const { vaultId, device } = auth.request;
  const vault = options.storage.vault(vaultId)!;

  if (frozen && vault.proofRefused)
    throw new EnvdenError("RECOVERY_CODE_REQUIRED", "Replace the recovery code before moving");

  if (vault.serverMoved) throw new EnvdenError("MOVING", "Move committed");

  options.storage.configureVault(vaultId, { ...vault, frozen }, [
    { kind: "move-session", key: new Uint8Array(), ...(frozen ? { bytes: device } : {}) },
  ]);

  return { kind: frozen ? "frozen" : "unfrozen" };
}
