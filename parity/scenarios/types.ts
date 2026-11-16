import type { TContext } from "../runtime/context.ts";
import type { TTailscaleNeed } from "../isolation/tailscale.ts";

export interface IStep {
  name: string;
  run: (context: TContext) => Promise<void>;
}

export interface IScenario {
  name: string;
  // Devices are a, b and c; servers are "server" (main) or "server:<name>".
  roles: string[];
  steps: IStep[];
  // Every setup checks tailnet HTTPS through tailscale, so vault scenarios need the stand-in.
  needs?: TTailscaleNeed;
  hostShims?: boolean;
  // Compare outputs only, for fixtures whose snapshot has no stable identity labeling.
  files?: false;
}
