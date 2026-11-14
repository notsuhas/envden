import { readOperation, type TOperation } from "./record.ts";
import * as p from "@envden/core/protocol";
import { markAppliedEntry } from "../../applied.ts";
import { text } from "../../../../client/encoding.ts";
import { deletionRequested } from "./deletion.ts";
import { canResume, contentHash, operationHashes } from "./guards.ts";
import { sanitizeTerminal } from "../../../../output/sanitize.ts";
import type { TSyncContext } from "../../../remote/context.ts";
import { atomicWrite } from "../../../../state/store/files.ts";
import { journalPlacement } from "../../../../state/journal/placement.ts";
import { basePath, readBytes, same, writeBytes } from "../../files.ts";
import { backup } from "../../conflicts.ts";
import { placeFileTarget } from "../placement.ts";
import { saveBase } from "../history.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function resumeFile(context: TSyncContext, store: string) {
  const path = basePath(context.adapters.home, store) + ".pending";
  const operation = await readOperation(path, context.options.report);
  if (!operation) return;
  const next = operation.next === null ? undefined : Buffer.from(operation.next, "base64");
  const server = operation.server === null ? undefined : Buffer.from(operation.server, "base64");

  const current = await operationHashes(context, store, operation.targets);

  operation.written = operation.written.map(
    (written, index) => written || current[index] === contentHash(next),
  );

  await recoverPlaces(context, store, operation, next);

  if (
    operation.header !==
      text(p.objectHash(p.ManifestHeaderCodec, context.checkpoint.header, "manifest")) ||
    !canResume(operation.before, current, contentHash(next), operation.written)
  ) {
    await writeBytes(path, undefined);

    return;
  }

  await finishFile(context, store, operation.targets, next, server, operation.entry, operation);
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

  if (
    before.every((hash) => hash === contentHash(next)) &&
    (await copiesRecorded(context, targets, next))
  ) {
    await finishFile(context, store, targets, next, server, entry);

    return;
  }

  await atomicWrite(
    basePath(context.adapters.home, store) + ".pending",
    JSON.stringify({
      targets,
      before,
      written: before.map((hash) => hash === contentHash(next)),
      entry,
      header: text(p.objectHash(p.ManifestHeaderCodec, context.checkpoint.header, "manifest")),
      next: next === undefined ? null : Buffer.from(next).toString("base64"),
      server: server === undefined ? null : Buffer.from(server).toString("base64"),
    } satisfies TOperation),
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
  operation?: TOperation,
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

  if (operation) await markWritten(context, store, operation, 0);

  if (entry) await atomicWrite(basePath(context.adapters.home, store) + ".entry", entry);
  await saveBase(basePath(context.adapters.home, store), next);
  await placeTargets(context, store, targets, next, server, operation);

  await journalPlacement(context.adapters.home, context.state);
}

async function placeTargets(
  context: TSyncContext,
  store: string,
  targets: TTarget[],
  next: Uint8Array | undefined,
  server: Uint8Array | undefined,
  operation?: TOperation,
) {
  const preserveDeleted =
    server !== undefined || (await deletionRequested(context.adapters.home, store));

  for (const [index, target] of targets.entries()) {
    if (!(await placeFileTarget(context, target, next, preserveDeleted))) continue;

    if (operation) await markWritten(context, store, operation, index + 1);

    if (target.mode === "copy")
      await saveBase(basePath(context.adapters.home, store, target.root), next);
  }
}

async function recoverPlaces(
  context: TSyncContext,
  store: string,
  operation: TOperation,
  next: Uint8Array | undefined,
) {
  if (operation.written[0]) {
    if (operation.entry)
      await atomicWrite(basePath(context.adapters.home, store) + ".entry", operation.entry);

    await saveBase(basePath(context.adapters.home, store), next);
  }

  for (const [index, target] of operation.targets.entries()) {
    if (target.mode !== "copy" || !operation.written[index + 1]) continue;

    await saveBase(basePath(context.adapters.home, store, target.root), next);
  }
}

export async function preservePendingAncestor(home: string, store: string) {
  const base = basePath(home, store);
  const operation = await readOperation(base + ".pending");
  if (!operation) return;
  const next = operation.next === null ? undefined : Buffer.from(operation.next, "base64");

  if (operation.entry && contentHash(await readBytes(store)) === contentHash(next))
    await atomicWrite(base + ".entry", operation.entry);
}

async function markWritten(
  context: TSyncContext,
  store: string,
  operation: TOperation,
  index: number,
) {
  operation.written[index] = true;
  await atomicWrite(basePath(context.adapters.home, store) + ".pending", JSON.stringify(operation));
}

async function copiesRecorded(
  context: TSyncContext,
  targets: TTarget[],
  next: Uint8Array | undefined,
) {
  for (const target of targets) {
    if (
      target.mode === "copy" &&
      !same(await readBytes(basePath(context.adapters.home, target.store, target.root)), next)
    )
      return false;
  }

  return true;
}
