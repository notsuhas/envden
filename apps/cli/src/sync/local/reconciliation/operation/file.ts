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
  next: string | null;
  server: string | null;
}

export async function resumeFile(context: TSyncContext, store: string) {
  const path = basePath(context.adapters.home, store) + ".pending";
  const saved = await optionalRead(path);
  if (!saved) return;
  const operation: IOperation = JSON.parse(saved);
  const next = operation.next === null ? undefined : Buffer.from(operation.next, "base64");
  const server = operation.server === null ? undefined : Buffer.from(operation.server, "base64");

  await finishFile(context, store, operation.targets, next, server);
  await writeBytes(path, undefined);
}

export async function commitFile(
  context: TSyncContext,
  targets: TTarget[],
  store: string,
  next: Uint8Array | undefined,
  server: Uint8Array | undefined,
) {
  if (same(await readBytes(store), next)) {
    await finishFile(context, store, targets, next, server);

    return;
  }

  await atomicWrite(
    basePath(context.adapters.home, store) + ".pending",
    JSON.stringify({
      targets,
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

  for (const target of targets) {
    if (!(await placeFileTarget(context, target, next, server !== undefined))) continue;

    if (target.mode === "copy")
      await saveBase(
        basePath(context.adapters.home, store, target.root),
        next,
        context.options.now(),
      );
  }

  await saveBase(basePath(context.adapters.home, store), server, context.options.now());
  await journalPlacement(context.adapters.home, context.state);
}
