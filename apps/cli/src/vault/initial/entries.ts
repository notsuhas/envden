import { readFile } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { text } from "../../client/encoding.ts";

import type { TClient } from "../../client/request.ts";

export async function initialEntries(
  adapters: TAdapters,
  state: ILocalState,
  client: TClient,
  vaultId: Uint8Array,
  key: Uint8Array,
  idKey: Uint8Array,
) {
  const files: p.IFiles = { entries: [] };

  for (const link of state.links) {
    if (link.localOnly) continue;
    const checkout = state.approved.find((item) => item.root === link.root);
    if (!checkout) throw new EnvdenError("UNAUTHORIZED", "Checkout approval required");
    const repoId = state.aliases[checkout.repoId] ?? checkout.repoId;
    const fileId = p.fileId(idKey, repoId, link.path);
    if (files.entries.some((item) => p.equal(item.fileId, fileId))) continue;
    const context = { vaultId, epoch: 1, fileId, version: 1n };
    const name = { repoId, path: link.path };
    const content = new Uint8Array(await readFile(link.store));
    const blob = p.sealFile({ ...name, content }, key, context);
    const blobHash = p.H("blob", blob);
    await client.request(`/v1/blobs/${text(blobHash)}`, "PUT", blob);

    files.entries.push({
      fileId,
      version: 1n,
      epoch: 1,
      state: 1,
      blobHash,
      name: p.sealFileName(name, key, context),
    });
  }

  return files;
}
