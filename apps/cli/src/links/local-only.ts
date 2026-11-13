import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { saveState } from "../state/repository.ts";

export async function markLocalOnly(
  adapters: TAdapters,
  state: ILocalState,
  root: string,
  path: string,
): Promise<void> {
  const link = state.links.find((item) => item.root === root && item.path === path);
  if (!link) throw new EnvdenError("NOT_FOUND", "File is not managed by envden");
  const placement = adapters.placement("copy", root);
  const status = await placement.inspect(link.store, join(root, path));

  if (status === "linked" || status === "relinkable")
    await placement.place(link.store, join(root, path));
  else if (status === "missing") throw new EnvdenError("NOT_FOUND", "File is missing");

  link.mode = "copy";
  link.localOnly = true;
  await saveState(adapters.home, state);
}
