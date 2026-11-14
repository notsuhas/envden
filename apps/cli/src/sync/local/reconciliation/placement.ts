import { sanitizeTerminal } from "../../../output/sanitize.ts";
import { readBytes, same } from "../files.ts";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { TSyncContext } from "../../remote/context.ts";
import { backup } from "../conflicts.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function placeFileTarget(
  context: Pick<TSyncContext, "adapters" | "state" | "options">,
  target: TTarget,
  bytes: Uint8Array | undefined,
  preserveDeleted = false,
) {
  const checkout = context.state.approved.find((item) => item.root === target.root);
  if (!checkout || !(await lstat(target.root).catch(() => undefined))?.isDirectory()) return false;

  const destination = join(target.root, target.path);
  const placement = context.adapters.placement(target.mode, target.root);
  const status = await placement.inspect(target.store, destination);

  const identical = status === "linked" || same(await readBytes(destination), bytes);

  if (!identical) {
    const saved = await backup(context.adapters.home, destination, context.options.now());
    if (saved) context.options.report?.(sanitizeTerminal(`Saved ${destination}: ${saved}`));
  }

  if (bytes !== undefined) {
    await context.adapters.repo.ensureIgnored(checkout, target.path);

    if (target.mode === "copy" ? !identical : status !== "linked")
      await placement.place(target.store, destination);

    trackTarget(context, target);
  } else {
    await removeTarget(context, target, preserveDeleted);
  }

  return true;
}

function trackTarget(context: Pick<TSyncContext, "state">, target: TTarget) {
  if (!context.state.links.some((item) => item.root === target.root && item.path === target.path))
    context.state.links.push(target);
}

async function removeTarget(
  context: Pick<TSyncContext, "adapters" | "state">,
  target: TTarget,
  preserveDeleted: boolean,
) {
  await context.adapters
    .placement(target.mode, target.root)
    .remove(target.store, join(target.root, target.path));

  if (!preserveDeleted)
    context.state.links = context.state.links.filter(
      (item) => item.root !== target.root || item.path !== target.path,
    );
}
