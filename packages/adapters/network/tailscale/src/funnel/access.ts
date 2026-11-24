import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";

const FUNNEL = "funnel";

const FUNNEL_PORTS = "https://tailscale.com/cap/funnel-ports";

const accessSchema = z.object({
  Self: z
    .object({ CapMap: z.record(z.string(), z.unknown()).nullish().catch(undefined) })
    .nullish()
    .catch(undefined),
});

type TFunnelAccess = "allowed" | "no-funnel" | "port-denied";

// Mirrors tailscale's own check, so the funnel command never stops to ask for enablement.
export function funnelAccess(stdout: string, port: number): TFunnelAccess {
  const capabilities = Object.keys(accessSchema.parse(JSON.parse(stdout)).Self?.CapMap ?? {});
  if (!capabilities.includes(FUNNEL)) return "no-funnel";

  const ports = capabilities
    .map(allowedPorts)
    .find((value) => value !== undefined)
    ?.split(",");

  return ports?.some((range) => inRange(range, port)) ? "allowed" : "port-denied";
}

function allowedPorts(capability: string): string | undefined {
  if (!capability.startsWith(`${FUNNEL_PORTS}?`)) return undefined;

  return new URL(capability).searchParams.get("ports") ?? undefined;
}

function inRange(range: string, port: number): boolean {
  const bounds = range.split("-").map(Number);

  return bounds[0]! <= port && port <= bounds.at(-1)!;
}

export function accessError(access: Exclude<TFunnelAccess, "allowed">) {
  if (access === "no-funnel")
    return new EnvdenError(
      "UNAUTHORIZED",
      `Tailscale Funnel isn't allowed for this device. A tailnet admin can add {"target": ["autogroup:member"], "attr": ["funnel"]} to nodeAttrs in the tailnet policy file. See https://tailscale.com/kb/1223/funnel`,
    );

  return new EnvdenError(
    "UNAUTHORIZED",
    "Tailscale Funnel isn't allowed on ports 10000, 8443 or 443 for this device. See https://tailscale.com/kb/1223/funnel",
  );
}
