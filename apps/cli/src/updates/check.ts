import { boundedFetch } from "../notice/fetch.ts";
import { compareSemver } from "@envden/core/protocol";
import type { TFetch } from "../client/fetch.ts";
import { latestRelease } from "./github.ts";
import { VERSION } from "../version.ts";

export interface IUpdateCache {
  checkedAt?: number;
  latest?: string;
  message?: string;
}

export async function checkRelease(
  state: IUpdateCache,
  now: number,
  fetcher: TFetch,
  force = false,
  deadline = AbortSignal.timeout(2000),
) {
  if (!force && state.checkedAt !== undefined && now - state.checkedAt < 86400000)
    return { kind: "skipped" as const };

  let sent = false;

  const tracked: TFetch = (input, init) => {
    init?.signal?.throwIfAborted();
    sent = true;

    return fetcher(input, init);
  };

  try {
    state.latest = await latestRelease(boundedFetch(tracked, deadline));
    delete state.message;

    return {
      kind: "checked" as const,
      latest: state.latest,
      available: compareSemver(state.latest, VERSION) > 0,
    };
  } catch {
    state.message = "Cannot confirm envden is up to date";

    return { kind: "unavailable" as const, message: state.message };
  } finally {
    if (sent) state.checkedAt = now;
  }
}
