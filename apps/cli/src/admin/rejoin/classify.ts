import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { classifyNonMember } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { THistory } from "../../vault/history.ts";
import { loadState, saveState } from "../../state/repository.ts";
import { atomicWrite } from "../../state/files.ts";
import { binary } from "../../client/encoding.ts";
import { deviceIdentity } from "../../identity/device.ts";

export async function checkRejoin(adapters: TAdapters, history: THistory) {
  const local = await loadState(adapters.home);
  if (!local?.checkpoint) return;
  const identity = await deviceIdentity(adapters.keychain, adapters.home, local.deviceName);

  const result = classifyNonMember({
    deviceId: identity.record.id,
    storedHeaders: local.headers.map((h) =>
      p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(h)),
    ),
    verifiedHeaders: history.headers,
    verifiedEntries: history.entries,
    state: history.state,
  });

  if (result.kind === "fork" || result.kind === "rollback")
    throw new EnvdenError(
      result.kind === "fork" ? "FORK" : "ROLLBACK",
      "Rejoin history conflicts with the stored floor",
    );

  return result;
}

export async function adoptRejoin(adapters: TAdapters, history: THistory) {
  const result = await checkRejoin(adapters, history);
  const local = await loadState(adapters.home);
  if (!result || !local) return;

  await atomicWrite(
    join(adapters.home, "state", `rejoin-floor-${local.checkpoint}`),
    JSON.stringify({ headers: local.headers, entries: local.entries }),
  );

  if (result.kind === "dropped-by-repair") {
    local.headers = [];
    delete local.checkpoint;
    await saveState(adapters.home, local);
  }
}

export async function rejoinIdentity(adapters: TAdapters, name: string) {
  return deviceIdentity(adapters.keychain, `${adapters.home}/rejoin`, name);
}

export async function finishRejoinIdentity(adapters: TAdapters) {
  const next = await adapters.keychain.get(`envden/${adapters.home}/rejoin/device`);
  if (!next) throw new EnvdenError("INVALID_DATA", "Missing rejoin identity");
  await adapters.keychain.set(`envden/${adapters.home}/device`, next);
  await adapters.keychain.delete(`envden/${adapters.home}/rejoin/device`);
}
