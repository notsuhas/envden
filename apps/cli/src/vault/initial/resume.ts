import { join } from "node:path";
import { readBytes, same } from "../../sync/local/files.ts";
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
  const bases = new Map<string, Uint8Array>();
  const { checkpoint, keys, state, vaultId, client, identity } = context;

  if (!isInitialPush(checkpoint.header, identity.record.id)) return;

  for (const entry of checkpoint.files.entries) {
    if (entry.state !== 1) return;
    const key = keys.get(entry.epoch)!;
    const c = { vaultId, fileId: entry.fileId, epoch: entry.epoch, version: entry.version };
    const name = p.openFileName(entry.name, key, checkpoint.idKey, c);

    const links = matchingLinks(state, name);

    if (!links.length) return;

    const blob = new Uint8Array(
      await (await client.request(`/v1/blobs/${text(entry.blobHash)}`)).arrayBuffer(),
    );

    const file = p.openFile(blob, key, checkpoint.idKey, c, entry.blobHash, name);

    if (!(await recordMatchingBases(adapters.home, links, file.content, bases))) return;
  }

  await persistCheckpoint(context);
  await recordPushed(adapters.home, checkpoint.files, bases);
}

function matchingLinks(
  state: Awaited<ReturnType<typeof syncContext>>["state"],
  name: { path: string; repoId: string },
) {
  return state.links.filter(
    (link) =>
      !link.localOnly &&
      link.path === name.path &&
      state.approved.some(
        (checkout) =>
          checkout.root === link.root &&
          (state.aliases[checkout.repoId] ?? checkout.repoId) === name.repoId,
      ),
  );
}

function isInitialPush(
  header: Awaited<ReturnType<typeof syncContext>>["checkpoint"]["header"],
  deviceId: Uint8Array,
) {
  return header.body.seq === 2n && header.body.op === 1 && p.equal(header.body.signer, deviceId);
}

async function recordMatchingBases(
  home: string,
  links: Awaited<ReturnType<typeof syncContext>>["state"]["links"],
  content: Uint8Array,
  bases: Map<string, Uint8Array>,
) {
  for (const link of links) {
    const local = await readBytes(link.mode === "copy" ? join(link.root, link.path) : link.store);
    if (!same(local, content)) return false;
    bases.set(basePath(home, link.store, link.mode === "copy" ? link.root : undefined), content);
  }

  return true;
}
