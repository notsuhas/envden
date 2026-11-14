import * as p from "@envden/core/protocol";
import { markAppliedEntry } from "../../applied.ts";
import { text } from "../../../../client/encoding.ts";
import { deletionRequested } from "./deletion.ts";
import { canResume, contentHash, operationHashes } from "./guards.ts";
import { sanitizeTerminal } from "../../../../output/sanitize.ts";
import type { TSyncContext } from "../../../remote/context.ts";
import { atomicWrite, optionalRead } from "../../../../state/store/files.ts";
import { journalPlacement } from "../../../../state/journal/placement.ts";
import { basePath, readBytes, same, writeBytes } from "../../files.ts";
import { backup } from "../../conflicts.ts";
import { placeFileTarget } from "../placement.ts";
import { saveBase } from "../history.ts";

type TTarget = TSyncContext["state"]["links"][number];

interface IOperation {
  targets: TTarget[];
  before: (string | null)[];
  next: string | null;
  server: string | null;
  header: string;
  entry: string | null;
}

export async function resumeFile(context: TSyncContext, store: string) {
  const path = basePath(context.adapters.home, store) + ".pending";
  const saved = await optionalRead(path);
  if (!saved) return;
  const operation: IOperation = JSON.parse(saved);
  const next = operation.next === null ? undefined : Buffer.from(operation.next, "base64");
  const server = operation.server === null ? undefined : Buffer.from(operation.server, "base64");

  const current = await operationHashes(context, store, operation.targets);

  await recoverPlaces(context, store, operation, current, next);

  if (
    operation.header !==
      text(p.objectHash(p.ManifestHeaderCodec, context.checkpoint.header, "manifest")) ||
    !canResume(operation.before, current, contentHash(next))
  ) {
    await writeBytes(path, undefined);

    return;
  }

  await finishFile(context, store, operation.targets, next, server, operation.entry);
  if (operation.entry) await markAppliedEntry(context.adapters.home, operation.entry);
  await writeBytes(path, undefined);
}

export async function commitFile(
  context: TSyncContext,
  targets: TTarget[],
  store: string,
  next: Uint8Array | undefined,
  server: Uint8Array | undefined,
  entry: string | null,
) {
  const before = await operationHashes(context, store, targets);

  if (before.every((hash) => hash === contentHash(next))) {
    await finishFile(context, store, targets, next, server, entry);

    return;
  }

  await atomicWrite(
    basePath(context.adapters.home, store) + ".pending",
    JSON.stringify({
      targets,
      before,
      entry,
      header: text(p.objectHash(p.ManifestHeaderCodec, context.checkpoint.header, "manifest")),
      next: next === undefined ? null : Buffer.from(next).toString("base64"),
      server: server === undefined ? null : Buffer.from(server).toString("base64"),
    } satisfies IOperation),
  );

  await resumeFile(context, store);
}

async function finishFile(
  context: TSyncContext,
  store: string,
  targets: TTarget[],
  next: Uint8Array | undefined,
  server: Uint8Array | undefined,
  entry: string | null,
) {
  if (!same(await readBytes(store), next)) {
    const saved = await backup(context.adapters.home, store, context.options.now());
    if (saved) context.options.report?.(sanitizeTerminal(`Saved ${store}: ${saved}`));
    await writeBytes(store, next);
  } else if (
    next !== undefined &&
    !same(await readBytes(basePath(context.adapters.home, store)), next)
  ) {
    await atomicWrite(store, next);
  }

  if (entry) await atomicWrite(basePath(context.adapters.home, store) + ".entry", entry);
  await placeTargets(context, store, targets, next, server);

  await saveBase(basePath(context.adapters.home, store), server, context.options.now());
  await journalPlacement(context.adapters.home, context.state);
}

async function placeTargets(
  context: TSyncContext,
  store: string,
  targets: TTarget[],
  next: Uint8Array | undefined,
  server: Uint8Array | undefined,
) {
  const preserveDeleted =
    server !== undefined || (await deletionRequested(context.adapters.home, store));

  for (const target of targets) {
    if (!(await placeFileTarget(context, target, next, preserveDeleted))) continue;

    if (target.mode === "copy")
      await saveBase(
        basePath(context.adapters.home, store, target.root),
        next,
        context.options.now(),
      );
  }
}

async function recoverPlaces(
  context: TSyncContext,
  store: string,
  operation: IOperation,
  current: (string | null)[],
  next: Uint8Array | undefined,
) {
  if (operation.entry && current[0] === contentHash(next))
    await atomicWrite(basePath(context.adapters.home, store) + ".entry", operation.entry);

  for (const [index, target] of operation.targets.entries()) {
    if (target.mode !== "copy" || current[index + 1] !== contentHash(next)) continue;

    await saveBase(
      basePath(context.adapters.home, store, target.root),
      next,
      context.options.now(),
    );
  }
}
