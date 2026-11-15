import { fileSizeNotice } from "../sync/local/validation/size.ts";
import { basePath, readBytes, writeBytes } from "../sync/local/files.ts";
import { choose } from "../output/prompts/questions.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";
import { homePath, realHome } from "../output/home-path.ts";
import { readFile, readlink, lstat, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import type { TAdapters } from "../adapters.ts";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite } from "../state/store/files.ts";
import { storePath } from "../store/path.ts";
import type { IPlacementAdapter } from "@envden/core/adapters";

export interface IOwnLink {
  checkout: ICheckout;
  path: string;
  link: string;
  target: string;
}

type TLinkResult = { kind: "done" } | { kind: "own-link"; link: IOwnLink };

export async function linkFile(
  adapters: TAdapters,
  state: ILocalState,
  checkout: ICheckout,
  placement: IPlacementAdapter,
  path: string,
  choose: (path: string) => Promise<"separate" | "store" | "skip"> = chooseVersion,
): Promise<TLinkResult> {
  const destination = join(checkout.root, path);
  const store = storePath(adapters.home, state.aliases[checkout.repoId] ?? checkout.repoId, path);
  const existing = state.links.find((item) => item.root === checkout.root && item.path === path);

  if (existing) {
    await relinkExisting(adapters, checkout, placement, destination, existing);

    return { kind: "done" };
  }

  if ((await lstat(destination)).isSymbolicLink()) {
    // the user's own link: the caller offers to take it over or counts it
    if ((await placement.inspect(store, destination)) !== "linked") {
      const link = await readlink(destination);
      const target = resolve(dirname(destination), link);

      return {
        kind: "own-link",
        link: { checkout, path, link, target: await realpath(target).catch(() => target) },
      };
    }

    if (!(await exists(store))) {
      await placement.remove(store, destination);
      const shown = homePath(destination, await realHome(adapters.userHome));
      console.error(`envden: removed ${sanitizeTerminal(shown)}, a link to a deleted copy`);

      return { kind: "done" };
    }

    state.links.push({ root: checkout.root, path, store, mode: placement.mode });

    return { kind: "done" };
  }

  const choice = await storeChoice(store, destination, choose, adapters.now);

  if (choice === "oversized") return { kind: "done" };

  if (choice === "skip") {
    console.error(`envden: ${sanitizeTerminal(destination)} differs from the synced copy; skipped`);

    return { kind: "done" };
  }

  await adapters.repo.ensureIgnored(checkout, path);

  if (choice === "separate") {
    state.links.push({ root: checkout.root, path, store, mode: "copy", localOnly: true });

    return { kind: "done" };
  }

  await placement.place(store, destination);

  if (placement.mode === "copy")
    await writeBytes(
      basePath(adapters.home, store, checkout.root),
      await readBytes(store),
      adapters.now,
    );

  state.links.push({ root: checkout.root, path, store, mode: placement.mode });

  return { kind: "done" };
}

async function chooseVersion(path: string): Promise<"separate" | "store" | "skip"> {
  if (!process.stdin.isTTY) return "skip";

  const choice = await choose(`${path} differs from the synced copy`, [
    { value: "separate" as const, label: "Keep separate (local only)" },
    { value: "store" as const, label: "Use the synced version" },
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

async function exists(path: string) {
  try {
    await lstat(path);

    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}
