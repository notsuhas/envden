import { applyTarget } from "./placement.ts";
import { consumeRepair } from "../../remote/repairs.ts";
import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../remote/context.ts";
import { entryContent } from "../../remote/content.ts";
import { basePath, readBytes } from "../files.ts";
import { recordConflict, conflictRecords } from "../conflicts.ts";

import type { ILocalState } from "../../../state/model.ts";
import {
  deriveContentAction,
  deriveStoreSource,
  deriveDefaultContent,
  deriveUntrackedConflict,
} from "./decision.ts";
import { resolveContent } from "./resolution.ts";

type TChoose = (path: string) => Promise<"keep-mine" | "take-server" | "merge">;

export async function reconcileTarget(
  context: TSyncContext,
  target: ILocalState["links"][number],
  store: string,
  server: Uint8Array | undefined,
  entry: p.IFileEntry,
  name: { path: string },
  oldFiles: p.IFiles,
  noFastForward: ReadonlySet<string>,
  choose?: TChoose,
) {
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

  const status = await targetStatus(context, target, store, destination, linked);

  const useStore = deriveStoreSource(target.mode, status, linked);

  const mine = await readBytes(useStore ? store : destination);

  if (
    deriveUntrackedConflict({ linked, useStore, mine, server, choosing: !!choose }).kind ===
    "conflict"
  ) {
    await recordConflict(context, { ...target, base }, mine, server);

    return { changed: 0, conflicts: 1 };
  }

  let previous = await readBytes(base);
  const old = oldFiles.entries.find((item) => p.equal(item.fileId, entry.fileId));
  if (!previous && old) previous = await entryContent(context, old);

  const action = deriveContentAction({
    linked,
    useStore,
    mine,
    server,
    previous,
    choosing: !!choose,
    repair: noFastForward.has(p.base32(entry.fileId)),
  });

  if (action.kind === "conflict" || action.kind === "repair-conflict") {
    await recordConflict(context, { ...target, base }, mine, server);

    if (action.kind === "repair-conflict")
      await consumeRepair(context.adapters.home, p.base32(entry.fileId));

    return { changed: 0, conflicts: 1 };
  }

  const resolution =
    action.kind === "write"
      ? action
      : await resolveContent(
          context,
          name.path,
          mine,
          server,
          previous,
          choose,
          deriveDefaultContent({ linked, useStore, mine, server, previous }),
        );

  if (resolution.kind === "conflict") {
    await recordConflict(context, { ...target, base }, mine, server);

    return { changed: 0, conflicts: 1 };
  }

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
