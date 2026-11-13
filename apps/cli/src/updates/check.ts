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
  if (
    !force &&
    (!state.updateCheck ||
      (state.lastFeedCheck !== undefined && now - state.lastFeedCheck < 86400000))
  )
    return { kind: "skipped" as const };

  state.lastFeedCheck = now;

  if (!trust)
    return { kind: "unavailable" as const, message: "Release signing keys are not configured" };

  state.lastFeedCheck = now;

  try {
    const response = await fetcher(releaseConfig.url, { redirect: "error" });

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
    };
  } catch {
    return { kind: "unavailable" as const, message: "Cannot confirm envden is up to date" };
  }
}
