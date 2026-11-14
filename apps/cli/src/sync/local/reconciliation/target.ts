import { hasAppliedEntry } from "../applied.ts";
import { text } from "../../../client/encoding.ts";
import { matchesBase } from "./history.ts";
import { applyTarget } from "./placement.ts";
import { consumeRepair } from "../../remote/repairs.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../remote/context.ts";
import { basePath, readBytes, same } from "../files.ts";
import { recordConflict, conflictRecords } from "../conflicts.ts";

import type { ILocalState } from "../../../state/model.ts";
import { deriveContentAction, deriveStoreSource, needsConflict } from "./decision.ts";
import { resolveContent } from "./resolution.ts";

type TChoose = (path: string) => Promise<"keep-mine" | "take-server" | "merge">;

export async function reconcileTarget(
  context: TSyncContext,
  target: ILocalState["links"][number],
  store: string,
  server: Uint8Array | undefined,
  entry: p.IFileEntry,
  name: { path: string },
  noFastForward: ReadonlySet<string>,
  choose?: TChoose,
) {
  const detachedChoice = context.options.interactive ? context.options.choose : undefined;

  const base = basePath(
    context.adapters.home,
    store,
    target.mode === "copy" ? target.root : undefined,
  );

  if ((await conflictRecords(context.adapters.home)).some((item) => item.base === base)) {
    return { changed: 0, conflicts: 1 };
  }

  const destination = join(target.root, target.path);

  const linked = context.state.links.some(
    (item) => item.root === target.root && item.path === target.path,
  );

  const status = await resolvedStatus(context, target, store, destination, linked, base);
  const previous = await readBytes(base);

  const useStore = status === "relinkable" || deriveStoreSource(target.mode, status, linked);

  const mine = await readBytes(useStore ? store : destination);

  const baseline = previous;

  const action = deriveContentAction({
    linked,
    useStore,
    mine,
    server,
    previous: baseline,
    detached: target.mode === "link" && status === "detached",
    choosing: !!choose,
    applied: await hasAppliedEntry(context.adapters.home, entry),
    tombstone: entry.state === 2 || entry.state === 4,
    repair: noFastForward.has(p.base32(entry.fileId)),
  });

  if (needsConflict(action.kind, !!choose, !!detachedChoice))
    return saveTargetConflict(context, { ...target, base }, entry, { mine, server }, noFastForward);

  const resolution =
    action.kind === "write"
      ? action
      : await resolveContent(
          context,
          name.path,
          mine,
          server,
          baseline,
          choose ?? (action.kind === "detached" ? detachedChoice : undefined),
          server,
        );

  if (resolution.kind === "conflict")
    return saveTargetConflict(context, { ...target, base }, entry, { mine, server }, noFastForward);

  return applyTarget(
    context,
    target,
    store,
    destination,
    base,
    status,
    linked,
    mine,
    server,
    resolution.next,
  );
}

async function targetStatus(
  context: TSyncContext,
  target: ILocalState["links"][number],
  store: string,
  destination: string,
  linked: boolean,
) {
  const placement = context.adapters.placement(target.mode, target.root);
  const stored = await readBytes(store);

  const status =
    !linked && stored === undefined
      ? (await readBytes(destination)) === undefined
        ? "missing"
        : "detached"
      : await placement.inspect(store, destination);

  return status;
}

async function resolvedStatus(
  context: TSyncContext,
  target: ILocalState["links"][number],
  store: string,
  destination: string,
  linked: boolean,
  base: string,
) {
  let status = await targetStatus(context, target, store, destination, linked);

  const stored = await readBytes(store);

  if (
    status === "detached" &&
    (same(await readBytes(destination), stored) ||
      (target.mode === "link"
        ? await matchesBase(base, await readBytes(destination))
        : same(await readBytes(base), await readBytes(destination))))
  ) {
    status = "relinkable";
  }

  return status;
}

async function saveTargetConflict(
  context: TSyncContext,
  target: Parameters<typeof recordConflict>[1],
  entry: p.IFileEntry,
  content: { mine: Uint8Array | undefined; server: Uint8Array | undefined },
  noFastForward: ReadonlySet<string>,
) {
  await recordConflict(
    context,
    { ...target, entry: text(p.FileEntryCodec.write(entry)) },
    content.mine,
    content.server,
  );

  const id = p.base32(entry.fileId);
  if (noFastForward.has(id)) await consumeRepair(context.adapters.home, id);

  return { changed: 0, conflicts: 1 };
}
