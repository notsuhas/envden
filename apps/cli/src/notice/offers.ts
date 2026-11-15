import { millisecondsInMinute } from "date-fns/constants";
import { z } from "zod";
import { readConfig } from "../settings/config.ts";
import { join } from "node:path";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";

const scansSchema = z.record(z.string(), z.number());

export async function cacheOffers(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string | undefined,
  update: { available: boolean; required: boolean },
  now = 0,
) {
  const path = join(adapters.home, "state", "track-offers");
  const roots = new Set(((await optionalRead(path)) ?? "").split("\n").filter(safeRoot));

  if (cwd) await scanOffer(adapters, state, cwd, roots, now);

  const pending = [...roots].filter((root) => !state.approved.some((item) => item.root === root));
  await atomicWrite(path, pending.join("\n") + (pending.length ? "\n" : ""), adapters.now);
  const lines = [];
  if (update.available) lines.push("envden: update available; run envden update");
  if (update.required) lines.push("envden: update required; run envden update");

  await atomicWrite(
    join(adapters.home, "state", "notice-update"),
    lines.join("\n") + (lines.length ? "\n" : ""),
    adapters.now,
  );
}

function safeRoot(root: string) {
  return !!root && sanitizeTerminal(root) === root && !/[\r\n]/.test(root);
}

async function scanOffer(
  adapters: TAdapters,
  state: ILocalState,
  cwd: string,
  roots: Set<string>,
  now: number,
) {
  const checkout = await adapters.repo.checkoutAt(cwd).catch(() => undefined);
  if (!checkout || !safeRoot(checkout.root) || roots.has(checkout.root)) return;
  if (state.approved.some((item) => item.root === checkout.root)) return;
  const path = join(adapters.home, "state", "track-scanned.json");
  const scans = await recentScans(path, now);
  const previous = scans[checkout.root];
  if (previous !== undefined && now - previous < millisecondsInMinute) return;

  const files = await adapters.repo.envFiles(
    checkout,
    (await readConfig(adapters.home))["env-files"],
  );

  if (files.length) roots.add(checkout.root);
  scans[checkout.root] = now;
  await atomicWrite(path, JSON.stringify(scans), adapters.now);
}

async function recentScans(path: string, now: number): Promise<Record<string, number>> {
  const saved = scansSchema.safeParse(JSON.parse((await optionalRead(path)) ?? "{}")).data ?? {};

  const scans: Record<string, number> = Object.fromEntries(
    Object.entries(saved)
      .filter((entry) => now - entry[1] < millisecondsInMinute)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 255),
  );

  return scans;
}
