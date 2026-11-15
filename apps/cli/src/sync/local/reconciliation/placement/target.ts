import { sanitizeTerminal } from "../../../../output/sanitize.ts";
import { readBytes, same } from "../../files.ts";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { TSyncContext } from "../../../remote/context.ts";
import { approvedCheckout } from "../../../../links/approval.ts";
import { targetSkip } from "./skip.ts";
import { keepUnsynced } from "./unsynced.ts";

type TTarget = TSyncContext["state"]["links"][number];

export async function placeFileTarget(
  context: Pick<TSyncContext, "adapters" | "state" | "options">,
  target: TTarget,
  bytes: Uint8Array | undefined,
  preserveDeleted = false,
  synced?: Uint8Array,
) {
  if (!(await lstat(target.root).catch(() => undefined))?.isDirectory()) return false;
  const destination = join(target.root, target.path);
  const checkout = await approvedCheckout(context.adapters.repo, context.state, target.root);
  const skip = targetSkip(context.state.links, target, !!checkout);

  if (skip) {
    context.options.report?.(sanitizeTerminal(`Skipped ${destination}: ${skipReasons[skip]}`));

    return false;
  }

  const placement = context.adapters.placement(target.mode, target.root);
  const status = await placement.inspect(target.store, destination);

  const identical = status === "linked" || same(await readBytes(destination), bytes);

  if (!identical) await keepUnsynced(context, destination, target, synced);

  if (bytes !== undefined) {
    await context.adapters.repo.ensureIgnored(checkout!, target.path);

    if (target.mode === "copy" ? !identical : status !== "linked")
      await placement.place(target.store, destination);

    trackTarget(context, target);
  } else {
    await removeTarget(context, target, preserveDeleted);
  }

  return true;
}

const skipReasons = {
  unapproved: "checkout needs approval; run envden track",
  "local-only": "marked local only",
  changed: "placement changed; run envden pull",
} as const;

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
