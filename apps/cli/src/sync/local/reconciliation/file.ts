import { fileSnapshot } from "./snapshot.ts";
import { commitFile, resumeFile } from "./operation/file.ts";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../../remote/context.ts";
import { text, binary } from "../../../client/encoding.ts";
import { entryContent } from "../../remote/content.ts";
import { appliedFiles } from "../applied.ts";
import { basePath, readBytes, same } from "../files.ts";
import { conflictRecords, recordConflict } from "../conflicts.ts";
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

  if ((await conflictRecords(context.adapters.home)).some((item) => item.store === store))
    return { changed: 0, conflicts: 1 };

  const snapshot = await readFileState(context, targets, store, entry);
  const { base, server, stored, snapshots } = snapshot;

  const { resolution, mine, local, repair } = await resolveFileState(
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
      conflictTheirs(snapshot, local),
      [stored, server, ...snapshots.map((item) => item.bytes)],
    );

    if (repair) await consumeRepair(context.adapters.home, p.base32(entry!.fileId));

    return { changed: 0, conflicts: 1 };
  }

  return applyFile(context, snapshot, store, resolution.next);
}

async function readFileState(
  context: TSyncContext,
  targets: TTarget[],
  store: string,
  entry: p.IFileEntry | undefined,
) {
  const base = basePath(context.adapters.home, store);
  const encoded = entry && (await appliedFiles(context.adapters.home))[p.base32(entry.fileId)];

  const previous = encoded
    ? await entryContent(context, p.decode(p.FileEntryCodec, binary(encoded)))
    : undefined;

  const server = entry ? await entryContent(context, entry) : undefined;
  const stored = await readBytes(store);

  const snapshots = await Promise.all(
    targets.map((target) => fileSnapshot(context, target, stored, previous)),
  );

  return { base, encoded, previous, server, stored, snapshots };
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
          conflictTheirs(snapshot, local),
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

  if (repair) resolution = { kind: "conflict" };

  return { resolution, mine, local, repair };
}

async function applyFile(
  context: TSyncContext,
  snapshot: Awaited<ReturnType<typeof readFileState>>,
  store: string,
  next: Uint8Array | undefined,
) {
  const { stored, server, snapshots } = snapshot;

  const changed =
    Number(!same(stored, next)) + snapshots.filter((item) => !same(item.bytes, next)).length;

  await commitFile(
    context,
    snapshots.map((item) => item.target),
    store,
    next,
    server,
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
    server,
    repair,
    detached,
    choosing,
    applied: !!entry && snapshot.encoded === text(p.FileEntryCodec.write(entry)),
    tombstone: entry?.state === 2 || entry?.state === 4,
  });

  return { local, mine, action, repair, detached };
}

function conflictTheirs(
  snapshot: Awaited<ReturnType<typeof readFileState>>,
  local: ReturnType<typeof deriveFileDecision>["local"],
) {
  return local.kind === "conflict" && same(snapshot.server, snapshot.previous)
    ? local.theirs
    : snapshot.server;
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
