import { skipReason, type IIsolation } from "../isolation/tailscale.ts";
import type { IScenario } from "../scenarios/types.ts";

export function scenarioSkip(
  scenario: IScenario,
  isolation: IIsolation,
  hostShims: boolean,
): string | undefined {
  if (scenario.hostShims && !hostShims)
    return "host shims are off; set PARITY_HOST_SHIMS=1 on a disposable CI runner";

  return scenario.needs ? skipReason(isolation, scenario.needs) : undefined;
}
