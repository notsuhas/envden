import type { TFetch } from "../client/fetch.ts";
import {
  type IReleaseTrust,
  acceptRelease,
  initialReleaseState,
  compareSemver,
} from "@envden/core/protocol";
import type { ILocalState } from "../state/model.ts";

import { releaseConfig } from "./release-config.ts";
import { VERSION } from "../version.ts";

export async function checkRelease(
  state: ILocalState,
  trust: IReleaseTrust | undefined,
  now: number,
  fetcher: TFetch,
  force = false,
) {
  if (!force && state.lastFeedCheck !== undefined && now - state.lastFeedCheck < 86400000)
    return { kind: "skipped" as const };

  if (!trust)
    return { kind: "unavailable" as const, message: "Release signing keys are not configured" };

  try {
    const response = await fetcher(releaseConfig.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok)
      return { kind: "unavailable" as const, message: "Cannot confirm envden is up to date" };

    const bytes = new Uint8Array(await response.arrayBuffer());
    const accepted = acceptRelease(bytes, initialReleaseState(trust, state.release), BigInt(now));

    if (!accepted.ok)
      return { kind: "unavailable" as const, message: "Cannot verify the release feed" };

    state.release = accepted.value.state;
    state.latest = accepted.value.release.latest;

    return {
      kind: "checked" as const,
      latest: state.latest,
      available: compareSemver(state.latest, VERSION) > 0,
      required: state.release.unsafe.includes(VERSION),
      expired: accepted.value.expired,
      release: accepted.value.release,
      feed: bytes,
    };
  } catch {
    return { kind: "unavailable" as const, message: "Cannot confirm envden is up to date" };
  } finally {
    state.lastFeedCheck = now;
  }
}

export function releaseCheckSummary(result: Awaited<ReturnType<typeof checkRelease>>) {
  if (result.kind !== "checked") return result;

  const { kind, latest, available, required, expired } = result;

  return { kind, latest, available, required, expired };
}
