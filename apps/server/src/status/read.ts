import { millisecondsInSecond } from "date-fns/constants";
import type { IAppOptions } from "../http/types.ts";
import { deriveQuotaBand } from "./band.ts";
import { deriveServerMode } from "./mode.ts";
import { StatusResponseSchema, type TStatusResponse } from "@envden/core/protocol";
import type { IStatusState } from "./types.ts";

export function readStatus(options: IAppOptions, state: IStatusState): TStatusResponse {
  const { storage, config, now } = options;
  const ids = storage.vaultIds();
  const usages = ids.map((id) => storage.vaultUsage(id));
  const vaults = ids.flatMap((id) => storage.vault(id) ?? []);

  return StatusResponseSchema.parse({
    version: config.appVersion,
    uptimeSeconds: Math.max(0, Math.floor((now() - state.startedAt) / millisecondsInSecond)),
    mode: deriveServerMode(vaults),
    vaults: ids.length,
    storageBytes: usages.reduce((total, size) => total + size, 0),
    fullestVault: deriveQuotaBand(usages),
    lastPrune: state.lastPrune
      ? { at: new Date(state.lastPrune.at).toISOString(), ok: state.lastPrune.ok }
      : null,
  });
}
