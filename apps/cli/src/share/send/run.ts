import { EnvdenError } from "@envden/core/errors";
import type { IPublicShare } from "@envden/core/adapters";
import { newShare, sealShare, shareText } from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import page from "../page/index.html";
import { createShareApp } from "../server/app.ts";
import { sharePage } from "../server/page.ts";
import { readShareFile } from "./file.ts";

type TOutcome = "claimed" | "expired" | "stopped";

export interface ISendProgress {
  opening(): void;
  ready(link: string, minutes: number, checked: boolean): void;
  finished(outcome: TOutcome): void;
  failed(): void;
}

interface ISendOptions {
  path: string;
  minutes: number;
  now: () => number;
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
  stopped: Promise<unknown>;
  progress: ISendProgress;
}

// Tailscale says a node's first public DNS record can take this long.
const READY_LIMIT_MS = 10 * 60_000;

export async function sendFile(adapters: Pick<TAdapters, "network">, options: ISendOptions) {
  const { minutes, now, progress } = options;
  const share = newShare();
  const id = shareText(share.id);
  const state = { claimed: false, expiresAt: Number.POSITIVE_INFINITY };
  const claim = Promise.withResolvers<void>();
  const timers = new AbortController();

  const app = createShareApp({
    id,
    box: sealShare(share, await readShareFile(options.path)),
    page: await sharePage(page),
    state,
    now,
    claimed: claim.resolve,
  });

  const server = Bun.serve({
    // The same idle timeout as envden serve; a claim carries no body.
    idleTimeout: 10,
    maxRequestBodySize: 1024,
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => app.fetch(request),
  });

  let link: IPublicShare | undefined;
  let outcome: TOutcome;
  const cut = () => void link?.close();
  process.once("exit", cut);

  try {
    progress.opening();
    link = await adapters.network.openPublicShare(server.port ?? 0, `/s/${id}`);
    const wait = (ms: number) => options.wait(ms, timers.signal);
    const stopped = options.stopped.then(() => "stopped" as const);

    const readiness = await Promise.race([
      link.ready,
      stopped,
      wait(READY_LIMIT_MS).then(() => "late" as const),
    ]);

    if (readiness === "late")
      throw new EnvdenError("SERVER_UNREACHABLE", "The public link didn't come up in 10 minutes");

    if (readiness !== "stopped") {
      state.expiresAt = now() + minutes * 60_000;
      progress.ready(`${link.url}#${shareText(share.key)}`, minutes, readiness === "public");
    }

    outcome =
      readiness === "stopped"
        ? readiness
        : await waitForClaim(link, claim.promise, wait(minutes * 60_000), stopped);
  } catch (cause) {
    progress.failed();
    throw cause;
  } finally {
    timers.abort();
    await server.stop();
    await link?.close();
    process.off("exit", cut);
  }

  progress.finished(outcome);

  return { kind: outcome };
}

async function waitForClaim(
  link: IPublicShare,
  claimed: Promise<void>,
  expiry: Promise<void>,
  stopped: Promise<"stopped">,
): Promise<TOutcome> {
  const outcome = await Promise.race([
    claimed.then(() => "claimed" as const),
    expiry.then(() => "expired" as const),
    stopped,
    link.ended.then(() => "ended" as const),
  ]);

  if (outcome === "ended") throw new EnvdenError("INTERNAL", "The public link closed unexpectedly");

  return outcome;
}
