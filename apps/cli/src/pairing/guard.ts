import { loadState } from "../state/store/repository.ts";
import { clearJoiner } from "./persistence/cleanup.ts";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";

export async function refuseCommittedJoin(adapters: TAdapters, rejoin = false) {
  const state = await loadState(adapters.home);
  if (rejoin || !state?.vaultId || state.creationPending) return;
  await clearJoiner(adapters);

  throw new EnvdenError(
    "CONFLICT",
    "Device already belongs to a vault; back up env files and remove the local envden home before joining another vault",
  );
}
