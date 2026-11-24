import { decodeHistoryHeader } from "../../client/history.ts";
import { verifiedBlob } from "../../vault/join/validation.ts";
import type { THistory } from "../../vault/history.ts";
import { readHistory } from "../../vault/history.ts";
import { deviceWrap } from "../../vault/keys/wrap.ts";
import { pendingRepairs, savePendingRepairs } from "./repairs.ts";
import * as p from "@envden/core/protocol";
import { acceptManifest, verifyChain } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TSyncContext } from "./context.ts";
import { text, binary } from "../../client/encoding.ts";
import { atomicWrite } from "../../state/store/files.ts";
import { join } from "node:path";

export async function acceptHead(context: TSyncContext, history?: THistory, readOnly = false) {
  const { client, checkpoint, identity, adapters, vaultId } = context;
  const pending = await pendingRepairs(adapters.home);

  const { remote, head } = await currentHead(context, history);
  const headers = remote.headers;
  const entries = remote.entries;

  const fileLists = new Map<string, p.IFiles>();
  let keyring: Uint8Array | undefined;

  const source = {
    header: (hash: Uint8Array) =>
      headers.find((item) => p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), hash)),
    entry: (hash: Uint8Array) =>
      entries.find((item) => p.equal(p.objectHash(p.EntryCodec, item, "entry"), hash)),
    files: async (hash: Uint8Array) => {
      try {
        const files = p.decode(p.FilesCodec, await verifiedBlob(client, "files", "files", hash));

        fileLists.set(text(hash), files);

        return files;
      } catch (error) {
        if (error instanceof EnvdenError && error.code === "NOT_FOUND") return undefined;
        throw error;
      }
    },
    keyring: async (hash: Uint8Array) => {
      keyring = new Uint8Array(
        await (
          await client.rpc.v1.keyrings[":hash"].$get({ param: { hash: text(hash) } })
        ).arrayBuffer(),
      );

      return keyring;
    },
    epochKey: async (epoch: number) => {
      const chain = verifyChain(entries.filter((item) => item.body.seq <= head.body.listSeq));
      if (chain.kind !== "valid") return undefined;
      const wrap = deviceWrap(entries, identity.record.id, head.body.listSeq);

      const commit = chain.state.commits.get(epoch);
      if (!wrap || !commit) return undefined;

      const key = await p.openWrap(
        wrap,
        identity.keys.encSk,
        identity.record.encPub,
        vaultId,
        epoch,
        commit,
      );

      context.keys.set(epoch, key);

      return key;
    },
  };

  const result = await acceptManifest({
    checkpoint,
    head,
    storedHeaders: context.headers,
    source,
    localFileIds: new Set(checkpoint.files.entries.map((item) => p.base32(item.fileId))),
  });

  if (result.kind === "unchanged") return { repairs: [], noFastForward: pending, fileLists };

  if (result.kind === "rollback")
    throw new EnvdenError("ROLLBACK", "Server rolled back; run envden server repair");

  if (result.kind === "fork") {
    context.options.report?.(
      `Local head: ${text(p.objectHash(p.ManifestHeaderCodec, checkpoint.header, "manifest"))}; server head: ${text(p.objectHash(p.ManifestHeaderCodec, head, "manifest"))}`,
    );

    throw new EnvdenError(
      "FORK",
      "Server history forked; create a new vault from a trusted device's store",
    );
  }

  if (result.kind !== "accepted") throw new EnvdenError("INVALID_DATA", "Invalid manifest history");
  context.checkpoint = result.checkpoint;
  const bySeq = new Map(context.headers.map((header) => [header.body.seq, header]));
  for (const header of result.headers) bySeq.set(header.body.seq, header);
  context.headers = [...bySeq.values()].sort((a, b) => (a.body.seq < b.body.seq ? -1 : 1));
  context.entries = entries.filter((item) => item.body.seq <= head.body.listSeq);

  if (keyring) {
    const ring = p.openKeyring(
      keyring,
      context.keys.get(head.body.epoch)!,
      vaultId,
      head.body.epoch,
      result.checkpoint.state.commits,
      checkpoint.idKey,
    );

    for (const item of ring.older) context.keys.set(item.epoch, item.key);
    context.state.keyring = text(keyring);

    if (!readOnly)
      await adapters.keychain.set(
        `envden/${adapters.home}/epoch/${head.body.epoch}`,
        context.keys.get(head.body.epoch)!,
      );
  }

  if (readOnly) return { repairs: result.repairs, noFastForward: pending, fileLists };

  for (const [hash, files] of fileLists)
    await atomicWrite(
      join(adapters.home, "state", "file-lists", hash),
      p.FilesCodec.write(files),
      context.options.now,
    );

  for (const id of result.noFastForward) pending.add(id);
  await savePendingRepairs(adapters.home, pending, context.options.now);

  return { repairs: result.repairs, noFastForward: pending, fileLists };
}

async function currentHead(context: TSyncContext, history?: THistory) {
  const { client, vaultId, state } = context;
  const raw = new Uint8Array(await (await client.rpc.v1.head.$get()).arrayBuffer());
  let remote = history ?? (await readHistory(client, vaultId, state));

  const known = remote.headers.find((header) =>
    p.equal(p.signedCodec(p.ManifestHeaderCodec).write(header), raw),
  );

  if (known) return { remote, head: known };
  remote = await readHistory(client, vaultId, state);

  const head = decodeHistoryHeader(
    raw,
    remote.entries,
    state.headers.map(binary),
    state.latest,
    remote.states,
  );

  return { remote, head };
}
