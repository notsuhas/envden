import { join } from "node:path";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { checkoutApproval } from "../../links/approval.ts";
import { appliedFiles } from "../local/applied.ts";

export async function removalTargets(adapters: TAdapters, state: ILocalState, store: string) {
  const targets: ILocalState["links"] = [];
  const skipped: string[] = [];

  for (const target of state.links.filter((link) => link.store === store && !link.localOnly)) {
    const checkout = await adapters.repo.checkoutAt(target.root);

    if (!checkout || checkoutApproval(state, checkout) !== "approved")
      skipped.push(join(target.root, target.path));
    else targets.push(target);
  }

  const blocked = state.links.some(
    (link) =>
      link.store === store && link.mode === "link" && skipped.includes(join(link.root, link.path)),
  );

  return { targets, skipped, blocked };
}

export async function removalEntry(
  adapters: TAdapters,
  state: ILocalState,
  root: string,
  path: string,
) {
  const checkout = state.approved.find((item) => item.root === root);
  const key = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  if (!checkout || !key) return undefined;
  const id = p.fileId(key, state.aliases[checkout.repoId] ?? checkout.repoId, path);

  return (await appliedFiles(adapters.home))[p.base32(id)];
}
