import { fileSizeNotice } from "../sync/local/validation/size.ts";
import { basePath, readBytes, writeBytes } from "../sync/local/files.ts";
import { choose } from "../output/questions.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";
import { readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite } from "../state/store/files.ts";
import { storePath } from "../store/path.ts";
import type { IPlacementAdapter } from "@envden/core/adapters";

export async function linkFile(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  placement: IPlacementAdapter,
  path: string,
  choose: (path: string) => Promise<"separate" | "store" | "skip"> = chooseVersion,
) {
  const destination = join(checkout.root, path);
  const store = storePath(adapters.home, state.aliases[checkout.repoId] ?? checkout.repoId, path);
  const existing = state.links.find((item) => item.root === checkout.root && item.path === path);

  if (existing) {
    await relinkExisting(adapters, checkout, placement, destination, existing);

    return;
  }

  if ((await lstat(destination)).isSymbolicLink()) {
    if ((await placement.inspect(store, destination)) !== "linked") {
      console.error(`envden: skipped symlink ${sanitizeTerminal(destination)}`);

      return;
    }

    state.links.push({ root: checkout.root, path, store, mode: placement.mode });

    return;
  }

  const choice = await storeChoice(store, destination, choose, adapters.now);

  if (choice === "oversized") return;

  if (choice === "skip") {
    console.error(`envden: ${sanitizeTerminal(destination)} differs from store; skipped`);

    return;
  }

  await adapters.repo.ensureIgnored(checkout, path);

  if (choice === "separate") {
    state.links.push({ root: checkout.root, path, store, mode: "copy", localOnly: true });

    return;
  }

  await placement.place(store, destination);

  if (placement.mode === "copy")
    await writeBytes(
      basePath(adapters.home, store, checkout.root),
      await readBytes(store),
      adapters.now,
    );

  state.links.push({ root: checkout.root, path, store, mode: placement.mode });
}

async function chooseVersion(path: string): Promise<"separate" | "store" | "skip"> {
  if (!process.stdin.isTTY) return "skip";

  const choice = await choose(`${path} differs from the store`, [
    { value: "separate" as const, label: "Keep separate (local only)" },
    { value: "store" as const, label: "Use the store version" },
  ]);

  return choice;
}

async function storeChoice(
  store: string,
  destination: string,
  choose: (path: string) => Promise<"separate" | "store" | "skip">,
  now: () => number,
) {
  const content = await readFile(destination);
  const notice = fileSizeNotice(destination, content);

  if (notice) {
    console.error(notice);

    return "oversized";
  }

  try {
    const stat = await lstat(store);

    if (!stat.isFile() || stat.isSymbolicLink())
      throw new EnvdenError("INVALID_DATA", "Unsafe store file");

    if (!(await readFile(store)).equals(content)) return choose(destination);
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      await atomicWrite(store, content, now);
    else throw cause;
  }

  return "store";
}

async function copyBase(
  home: string,
  store: string,
  root: string,
  mode: IPlacementAdapter["mode"],
  now: () => number,
) {
  if (mode !== "copy") return;
  await writeBytes(basePath(home, store, root), await readBytes(store), now);
}

async function relinkExisting(
  adapters: TAdapters,
  checkout: ICheckout,
  placement: IPlacementAdapter,
  destination: string,
  existing: ILocalState["links"][number],
) {
  if (existing.localOnly) return;
  const current = adapters.placement(existing.mode, checkout.root);
  const status = await current.inspect(existing.store, destination);
  if (status !== "relinkable" && status !== "linked") return;

  if (existing.mode !== placement.mode) {
    await placement.place(existing.store, destination);
    await copyBase(adapters.home, existing.store, checkout.root, placement.mode, adapters.now);
    existing.mode = placement.mode;
  } else if (status === "relinkable") await current.place(existing.store, destination);
}
