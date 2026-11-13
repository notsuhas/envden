import { saveBase } from "./history.ts";
import { journalPlacement } from "../../../state/journal/placement.ts";
import type { TSyncContext } from "../../remote/context.ts";
import { readBytes, same, writeBytes } from "../files.ts";
import { backup } from "../conflicts.ts";

import type { ILocalState } from "../../../state/model.ts";

export async function applyTarget(
  context: TSyncContext,
  target: ILocalState["links"][number],
  store: string,
  destination: string,
  base: string,
  status: string,
  linked: boolean,
  mine: Uint8Array | undefined,
  server: Uint8Array | undefined,
  next: Uint8Array | undefined,
) {
  const placement = context.adapters.placement(target.mode, target.root);
  let changed = 0;

  if (!same(mine, next)) {
    await backup(
      context.adapters.home,
      target.mode === "link" && linked && status !== "detached" ? store : destination,
      context.options.now(),
    );

    changed++;
  }

  const checkout = context.state.approved.find((item) => item.root === target.root)!;
  await context.adapters.repo.ensureIgnored(checkout, target.path);

  if (!same(await readBytes(store), next)) {
    await backup(context.adapters.home, store, context.options.now());
    await writeBytes(store, next);
  }

  if (next) {
    if (target.mode === "copy" || status !== "linked") await placement.place(store, destination);

    if (!linked) context.state.links.push(target);
  } else if (target.mode === "copy" || status === "linked") {
    await placement.remove(store, destination);
  }

  await journalPlacement(context.adapters.home, context.state);
  await saveBase(base, server);

  return { changed, conflicts: 0 };
}
