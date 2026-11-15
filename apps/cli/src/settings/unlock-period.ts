import { milliseconds } from "date-fns";
import { millisecondsInDay, millisecondsInWeek } from "date-fns/constants";
import { UnlockPeriodSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { requireConfigured } from "../state/configured.ts";
import { loadState } from "../state/store/repository.ts";
import { vaultConnection } from "../vault/connection.ts";
import { login } from "../session/login.ts";

export function unlockPeriod(value: string) {
  switch (value) {
    case "1d":
      return millisecondsInDay;
    case "7d":
      return millisecondsInWeek;
    case "30d":
      return milliseconds({ days: 30 });
    case "never":
      return null;
    default:
      throw new EnvdenError("INVALID_INPUT", "Expected 1d, 7d, 30d or never");
  }
}

export async function setUnlockPeriod(
  adapters: TAdapters,
  value: string,
  password: string,
  now: () => number,
) {
  const period = unlockPeriod(value);
  const state = requireConfigured(await loadState(adapters.home), "Run setup or join first");
  const { client, vaultId } = await vaultConnection(adapters, state, now, adapters.fetcher);
  await login(client, vaultId, password);
  await client.request("/v1/settings/unlock-period", "PUT", { period });
}

export async function getUnlockPeriod(adapters: TAdapters, now: () => number) {
  const state = requireConfigured(await loadState(adapters.home), "Run setup or join first");
  const { client } = await vaultConnection(adapters, state, now, adapters.fetcher);

  return UnlockPeriodSchema.parse(
    await (await client.request("/v1/settings/unlock-period")).json(),
  );
}
