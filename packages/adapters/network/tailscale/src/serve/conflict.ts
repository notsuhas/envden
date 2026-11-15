import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";

const serveSchema = z.object({
  TCP: z.record(z.string(), z.object({ TCPForward: z.string().optional() })).optional(),
  Web: z
    .record(
      z.string(),
      z.object({ Handlers: z.record(z.string(), z.object({ Proxy: z.string().optional() })) }),
    )
    .optional(),
});

function parseServe(stdout: string) {
  try {
    return serveSchema.parse(JSON.parse(stdout.trim() || "{}") ?? {});
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid Tailscale serve status", { cause });
  }
}

// True when this machine's port 443 already serves anything other than `target` at `/`.
export function serveConflict(stdout: string, hostname: string, target: string): boolean {
  const { TCP: tcp = {}, Web: web = {} } = parseServe(stdout);
  const listener = tcp["443"];
  const site = web[`${hostname}:443`];
  if (!listener && !site) return false;

  if (listener?.TCPForward || !site) return true;

  const handlers = Object.entries(site.Handlers);

  return !(handlers.length === 1 && handlers[0]![0] === "/" && handlers[0]![1].Proxy === target);
}
