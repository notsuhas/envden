import { Resolver } from "node:dns/promises";

export type TLookup = (
  host: string,
  signal: AbortSignal,
) => Promise<"found" | "missing" | "unknown">;

export type TPause = (ms: number, signal: AbortSignal) => Promise<void>;

const RETRY_MS = 5000;

const PUBLIC_RESOLVERS = ["1.1.1.1", "8.8.8.8"];

const ABSENT = new Set(["ENOTFOUND", "ENODATA"]);

// Tailscale says a new public record can take 10 minutes; a dead link is worse than a wait.
export async function publicName(
  host: string,
  lookup: TLookup,
  pause: TPause,
  signal: AbortSignal,
): Promise<"public" | "unchecked"> {
  for (;;) {
    signal.throwIfAborted();
    const answer = await lookup(host, signal);
    if (answer !== "missing") return answer === "found" ? "public" : "unchecked";

    await pause(RETRY_MS, signal);
  }
}

// Asks the zone's own nameservers, so a cached "no such name" can't hide a fresh record.
export async function lookupPublic(host: string, signal: AbortSignal) {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  signal.addEventListener("abort", () => resolver.cancel(), { once: true });

  try {
    resolver.setServers(PUBLIC_RESOLVERS);
    const servers = await authoritative(resolver, host);
    if (!servers.length) return "unknown";

    resolver.setServers(servers);

    return (await resolver.resolve4(host)).length ? "found" : "missing";
  } catch (cause) {
    return absent(cause) ? "missing" : "unknown";
  }
}

async function authoritative(resolver: Resolver, host: string): Promise<string[]> {
  const labels = host.split(".");

  for (let index = 1; index < labels.length - 1; index++) {
    const names = await resolver.resolveNs(labels.slice(index).join(".")).catch(none);

    if (names.length)
      return (await Promise.all(names.map((name) => resolver.resolve4(name).catch(none)))).flat();
  }

  return [];
}

function none(cause: unknown): string[] {
  if (absent(cause)) return [];
  throw cause;
}

function absent(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && ABSENT.has(String(cause.code));
}
