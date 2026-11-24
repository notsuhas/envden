import { z } from "zod";
import { EnvdenError } from "@envden/core/errors";

const configSchema = z.object({
  TCP: z.record(z.string(), z.object({ TCPForward: z.string().optional() })).optional(),
  Web: z
    .record(
      z.string(),
      z.object({ Handlers: z.record(z.string(), z.object({ Proxy: z.string().optional() })) }),
    )
    .optional(),
});

// Each running foreground `tailscale serve` or `funnel` keeps its own config here.
const serveSchema = configSchema.extend({
  Foreground: z.record(z.string(), configSchema).optional(),
});

export function parseServe(stdout: string) {
  try {
    return serveSchema.parse(JSON.parse(stdout.trim() || "{}") ?? {});
  } catch (cause) {
    throw new EnvdenError("INVALID_DATA", "Invalid Tailscale serve status", { cause });
  }
}

// True when this machine's `port` already serves anything other than `target` at `/`.
export function serveConflict(
  stdout: string,
  hostname: string,
  port: number,
  target: string,
): boolean {
  const { TCP: tcp = {}, Web: web = {} } = parseServe(stdout);
  const listener = tcp[String(port)];
  const site = web[`${hostname}:${port}`];
  if (!listener && !site) return false;

  if (listener?.TCPForward || !site) return true;

  const handlers = Object.entries(site.Handlers);

  return !(handlers.length === 1 && handlers[0]![0] === "/" && handlers[0]![1].Proxy === target);
}
