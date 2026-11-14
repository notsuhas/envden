import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import { text } from "../../client/encoding.ts";
import { syncContext } from "../../sync/remote/context.ts";
import { acceptHead } from "../../sync/remote/accept.ts";
import { persistCheckpoint } from "../../sync/remote/persist.ts";
import { basePath } from "../../sync/local/files.ts";
import { recordPushed } from "./record.ts";

export async function resumeInitialFiles(adapters: TAdapters, now: () => number) {
  const context = await syncContext(adapters, { now, fetcher: adapters.fetcher });
  await acceptHead(context);
  await persistCheckpoint(context);
  const bases = new Map<string, Uint8Array>();
  const { checkpoint, keys, state, vaultId, client } = context;

  for (const entry of checkpoint.files.entries) {
    if (entry.state !== 1 && entry.state !== 3) continue;
    const key = keys.get(entry.epoch)!;
    const c = { vaultId, fileId: entry.fileId, epoch: entry.epoch, version: entry.version };
    const name = p.openFileName(entry.name, key, checkpoint.idKey, c);

    const links = state.links.filter(
      (link) =>
        !link.localOnly &&
        link.path === name.path &&
        state.approved.some(
          (checkout) =>
            checkout.root === link.root &&
            (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId,
        ),
    );

    if (!links.length) continue;

    const blob = new Uint8Array(
      await (await client.request(`/v1/blobs/${text(entry.blobHash)}`)).arrayBuffer(),
    );

    const file = p.openFile(blob, key, checkpoint.idKey, c, entry.blobHash, name);

    for (const link of links)
      bases.set(
        basePath(adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
        file.content,
      );
  }

  await recordPushed(adapters.home, checkpoint.files, bases);
}
