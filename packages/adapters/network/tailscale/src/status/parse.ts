import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";
import type { INetworkStatus } from "@envden/core/adapters";

const statusSchema = z.object({
  BackendState: z.string(),
  Self: z.object({ DNSName: z.string() }).optional().catch(undefined),
  CertDomains: z.array(z.string()).catch([]),
});

export function parseStatus(stdout: string): INetworkStatus {
  const result = statusSchema.safeParse(JSON.parse(stdout));
  if (!result.success) throw new EnvdenError("INVALID_DATA", "Invalid Tailscale status");

  const { BackendState: state, Self: self, CertDomains: domains } = result.data;
  const running = state === "Running";
  const loggedIn = !["NeedsLogin", "NoState"].includes(state);
  const dns = self?.DNSName.replace(/\.$/, "");
  const httpsEnabled = domains.some((name) => name === dns);

  return {
    ready: running && loggedIn && httpsEnabled,
    running,
    loggedIn,
    httpsEnabled,
    hostname: dns,
    ...(!running
      ? { problem: "Tailscale is not running" }
      : !httpsEnabled
        ? { problem: "Enable HTTPS certificates on the tailnet" }
        : {}),
  };
}
