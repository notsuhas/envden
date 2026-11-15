import { blocksFile } from "./operation/conflict.ts";
import { readFileState } from "./operation/state.ts";
import { commitFile, resumeFile } from "./operation/file.ts";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../remote/context.ts";
import { text } from "../../../client/encoding.ts";
import { same } from "../files.ts";
import { recordConflict } from "../conflicts.ts";
import { deriveFileDecision } from "./file-decision.ts";
import { resolveContent } from "./resolution.ts";
import { consumeRepair } from "../../remote/repairs.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function reconcileFile(
  context: TSyncContext,
  targets: TTarget[],
  store: string,
  entry: p.IFileEntry | undefined,
  repairs: ReadonlySet<string>,
  choose?: Parameters<typeof resolveContent>[5],
) {
  await resumeFile(context, store);

  const snapshot = await readFileState(context, targets, store, entry);
  const { base, server, stored, snapshots } = snapshot;

  if (
    await blocksFile(
      context.adapters.home,
      store,
      decideFile(snapshot, entry, repairs, !!choose).action.kind === "write" &&
        same(snapshot.stored, snapshot.server) &&
        snapshot.snapshots.every(
          (item) => item.bytes === undefined || same(item.bytes, snapshot.server),
        ),
      context.options.now,
    )
  )
    return { changed: Number(snapshot.restored), conflicts: 1 };

  const { resolution, mine, repair } = await resolveFileState(
    context,
    snapshot,
    entry,
    repairs,
    choose,
  );

  if (resolution.kind !== "write") {
    await recordConflict(
      context,
      {
        ...targets[0]!,
        base,
        entry: entry ? text(p.FileEntryCodec.write(entry)) : null,
        targets,
      },
      mine,
      snapshot.server,
      [stored, server, ...snapshots.map((item) => item.bytes)],
    );

    if (repair)
      await consumeRepair(context.adapters.home, p.base32(entry!.fileId), context.options.now);

    return { changed: Number(snapshot.restored), conflicts: 1 };
  }

  return applyFile(context, snapshot, store, resolution.next, entry);
}

async function resolveFileState(
  context: TSyncContext,
  snapshot: Awaited<ReturnType<typeof readFileState>>,
  entry: p.IFileEntry | undefined,
  repairs: ReadonlySet<string>,
  choose: Parameters<typeof resolveContent>[5],
) {
  const { previous, server, snapshots } = snapshot;

  const { local, mine, action, repair, detached } = decideFile(snapshot, entry, repairs, !!choose);

  const chooser =
    choose ?? (detached && context.options.interactive ? context.options.choose : undefined);

  let resolution =
    local.kind === "conflict"
      ? await resolveLocalConflict(
          context,
          local,
          snapshots[0]!.target.path,
          chooser,
          snapshot.server,
        )
      : action.kind === "write"
        ? action
        : await resolveContent(
            context,
            snapshots[0]!.target.path,
            mine,
            server,
            previous,
            chooser,
            server,
          );

  if (repair || (local.kind !== "conflict" && action.kind === "conflict"))
    resolution = { kind: "conflict" };

  return { resolution, mine, repair };
}

async function applyFile(
  context: TSyncContext,
  snapshot: Awaited<ReturnType<typeof readFileState>>,
  store: string,
  next: Uint8Array | undefined,
  entry: p.IFileEntry | undefined,
) {
  const { stored, server, snapshots } = snapshot;

  const changed =
    Number(snapshot.restored) +
    Number(!same(stored, next)) +
    snapshots.filter((item) => !same(item.bytes, next)).length;

  await commitFile(
    context,
    snapshots.map((item) => item.target),
    store,
    next,
    server,
    entry ? text(p.FileEntryCodec.write(entry)) : null,
  );

  return { changed, conflicts: 0 };
}

function decideFile(
  snapshot: Awaited<ReturnType<typeof readFileState>>,
  entry: p.IFileEntry | undefined,
  repairs: ReadonlySet<string>,
  choosing: boolean,
) {
  const { previous, server, stored, snapshots } = snapshot;
  const repair = !!entry && repairs.has(p.base32(entry.fileId));
  const detached = snapshots.some((item) => item.detached);

  const { local, mine, action } = deriveFileDecision({
    store: stored,
    copies: snapshots.filter((item) => !item.useStore),
    tracked: snapshots.some((item) => item.tracked),
    published: entry !== undefined,
    previous,
    recorded: snapshot.recorded,
    reappeared: snapshot.reappeared,
    server,
    repair,
    detached,
    choosing: choosing || snapshot.deletionInvalid,
    applied: !!entry && snapshot.encoded === text(p.FileEntryCodec.write(entry)),
    tombstone: entry?.state === 2 || entry?.state === 4,
    deleting: snapshot.deleting,
  });

  return {
    local,
    mine,
    action: snapshot.deletionInvalid || snapshot.corrupt ? { kind: "conflict" as const } : action,
    repair,
    detached,
  };
}

async function resolveLocalConflict(
  context: TSyncContext,
  local: Extract<ReturnType<typeof deriveFileDecision>["local"], { kind: "conflict" }>,
  path: string,
  choose: Parameters<typeof resolveContent>[5],
  theirs: Uint8Array | undefined,
) {
  if (!choose || context.options.interactive === false) return { kind: "conflict" } as const;
  const choice = await choose(path);
  if (choice === "merge") return { kind: "conflict" } as const;

  return { kind: "write", next: choice === "keep-mine" ? local.mine : theirs } as const;
}
