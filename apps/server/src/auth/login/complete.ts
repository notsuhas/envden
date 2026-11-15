import { milliseconds } from "date-fns";
import { membership } from "../../vault/chain.ts";
import { hasProof } from "../token.ts";
import { repairHistory } from "../../repair/close.ts";
import { repairLoginDecision } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";

export function completeLogin(
  options: IAppOptions,
  auth: IAuth,
  purpose: "unlock" | "kit",
  receipt: string,
) {
  const { storage, now } = options;
  const { vaultId, device } = auth.request;

  if (purpose !== "kit" && !membership(storage, vaultId, device))
    throw new EnvdenError("NOT_MEMBER", "Membership required");

  if (purpose === "kit") {
    storage.putSession(
      vaultId,
      { kind: "join-ticket", device, purpose: "kit" },
      new Uint8Array([1]),
      now(),
    );
  } else if (storage.vault(vaultId)?.restored) {
    if (
      !hasProof(options, auth, "repair") ||
      repairLoginDecision(repairHistory(options, vaultId)) !== "login"
    )
      throw new EnvdenError("UNAUTHORIZED", "Registration required");

    storage.putSession(
      vaultId,
      { kind: "login", device, purpose: "repair-finish" },
      storage.vault(vaultId)!.restored!.repairTokenHash,
      now(),
    );
  } else {
    const state = storage.device(vaultId, device)!;
    const period = storage.vault(vaultId)?.unlockPeriod ?? milliseconds({ days: 30 });

    storage.putDevice(vaultId, device, {
      ...state,
      unlockedUntil:
        storage.vault(vaultId)?.unlockPeriod === null ? Number.MAX_SAFE_INTEGER : now() + period,
      freshUntil: now() + milliseconds({ minutes: 10 }),
    });
  }

  storage.refund(receipt, now());
}
