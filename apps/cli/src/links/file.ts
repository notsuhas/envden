import { readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite } from "../state/files.ts";
import { storePath } from "../store/path.ts";
import type { IPlacementAdapter } from "@envden/core/adapters";

export async function linkFile(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  placement: IPlacementAdapter,
  path: string,
) {
  const destination = join(checkout.root, path);
  const store = storePath(adapters.home, state.aliases[checkout.repoId] ?? checkout.repoId, path);
  const existing = state.links.find((item) => item.root === checkout.root && item.path === path);

  if (existing) {
    if (existing.localOnly) return;
    const current = adapters.placement(existing.mode, checkout.root);
    const status = await current.inspect(existing.store, destination);
    if (status === "relinkable") await current.place(existing.store, destination);

    return;
  }

  const content = await readFile(destination);

  try {
    const stat = await lstat(store);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe store file");

    if (!(await readFile(store)).equals(content))
      throw new EnvdenError(
        "CONFLICT",
        "Checkout differs from the store; choose which version to keep",
      );
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      await atomicWrite(store, content);
    else throw cause;
  }

  await adapters.repo.ensureIgnored(checkout, path);
  await placement.place(store, destination);
  state.links.push({ root: checkout.root, path, store, mode: placement.mode });
}
