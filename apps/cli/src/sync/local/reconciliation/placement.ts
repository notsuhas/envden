import { readBytes, same } from "../files.ts";
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
  const destination = join(target.root, target.path);
  const placement = context.adapters.placement(target.mode, target.root);
  const status = await placement.inspect(target.store, destination);

  const identical = status === "linked" || same(await readBytes(destination), bytes);
  if (!identical) await backup(context.adapters.home, destination, context.options.now());

  if (bytes !== undefined) {
    const checkout = context.state.approved.find((item) => item.root === target.root)!;
    await context.adapters.repo.ensureIgnored(checkout, target.path);

    if (target.mode === "copy" ? !identical : status !== "linked")
      await placement.place(target.store, destination);

    if (!context.state.links.some((item) => item.root === target.root && item.path === target.path))
      context.state.links.push(target);
  } else {
    if (target.mode === "copy" || status === "linked")
      await placement.remove(target.store, destination);

    if (!preserveDeleted)
      context.state.links = context.state.links.filter(
        (item) => item.root !== target.root || item.path !== target.path,
      );
  }
}
