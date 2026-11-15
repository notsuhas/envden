import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { storePath } from "../../store/path.ts";
import { basePath, readBytes, same, writeBytes } from "../../sync/local/files.ts";
import { fileSizeNotice } from "../../sync/local/validation/size.ts";
import { homePath, realHome } from "../../output/home-path.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import { supportedPlacement } from "../checkout/supported.ts";
import type { IOwnLink } from "../file.ts";
import type { IOwnLinkGroup } from "./group.ts";
import { readTarget } from "./target.ts";

// returns the links left in place
export async function adoptGroup(
  adapters: TAdapters,
  state: ILocalState,
  group: IOwnLinkGroup,
  copy = false,
): Promise<IOwnLink[]> {
  const home = await realHome(adapters.userHome);
  const target = sanitizeTerminal(homePath(group.target, home));
  const content = await readTarget(group.target);

  if (!content) {
    console.error(`envden: can't read ${target}; left the links to it in place`);

    return group.links;
  }

  const notice = fileSizeNotice(group.target, content);

  if (notice) {
    console.error(notice);

    return group.links;
  }

  const left: IOwnLink[] = [];

  for (const link of group.links) {
    const shown = sanitizeTerminal(homePath(join(link.checkout.root, link.path), home));
    const adopted = await adoptLink(adapters, state, link, content, copy).catch(() => undefined);

    if (adopted) continue;

    if (adopted === undefined)
      console.error(`envden: couldn't take over ${shown}; left it linked to ${target}`);
    else console.error(`envden: left ${shown} linked to ${target}: its synced copy differs`);

    left.push(link);
  }

  return left;
}

// worktrees of one repo share a store file, so the second one finds it already written
async function adoptLink(
  adapters: TAdapters,
  state: ILocalState,
  own: IOwnLink,
  content: Uint8Array,
  copy: boolean,
) {
  const { checkout, path } = own;
  const store = storePath(adapters.home, state.aliases[checkout.repoId] ?? checkout.repoId, path);
  const stored = await readBytes(store);

  if (stored === undefined) await atomicWrite(store, content, adapters.now);
  else if (!same(stored, content)) return false;

  await adapters.repo.ensureIgnored(checkout, path);
  const placement = await supportedPlacement(adapters, checkout.root, copy);
  await placement.place(store, join(checkout.root, path), undefined, own.link);

  if (placement.mode === "copy")
    await writeBytes(basePath(adapters.home, store, checkout.root), content, adapters.now);

  state.links.push({
    root: checkout.root,
    path,
    store,
    mode: placement.mode,
    originalLink: own.link,
  });

  return true;
}
