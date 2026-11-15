import type { IStatusState } from "./types.ts";

export function createStatusState(
  startedAt: number,
  env: Record<string, string | undefined>,
): IStatusState {
  return { enabled: env.ENVDEN_STATUS_PAGE !== "off", startedAt };
}
