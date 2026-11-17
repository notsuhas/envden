import { fixtureKeys, unwrapKeys } from "./keys.ts";
import { createHash } from "node:crypto";
import * as p from "@envden/core/protocol";
import { hex } from "./encoding.ts";
import { check, type IRetained } from "./objects.ts";

export async function decrypted(
  root: string,
  objects: IRetained[],
  semantics: Map<string, unknown>,
): Promise<void> {
  const { keys, identities } = await fixtureKeys(root, semantics);

  const headers = objects
    .filter((o) => o.kind === "manifest")
    .map((o) => p.decode(p.signedCodec(p.ManifestHeaderCodec), o.bytes).body);

  const entries = objects
    .filter((o) => o.kind === "entry")
    .map((o) => p.decode(p.signedCodec(p.EntryCodec), o.bytes).body);

  await unwrapKeys(entries, identities, keys);

  const idKeys = new Map<string, Uint8Array>();

  function commits(vault: Uint8Array): Map<number, Uint8Array> {
    const result = new Map<number, Uint8Array>();

    for (const e of entries) {
      if (!p.equal(e.vaultId, vault)) continue;

      if (e.kind === 2 || e.kind === 3 || e.kind === 4)
        result.set(e.payload.change.epoch, e.payload.change.keyCommit);
    }

    return result;
  }

  function epochKey(vault: Uint8Array, epoch: number): Uint8Array | undefined {
    const commit = commits(vault).get(epoch);

    return commit && keys.find((key) => p.equal(p.keyCommit(key, vault, epoch), commit));
  }

  for (const o of objects.filter(
    (o) => o.kind === "keyring" || o.kind === "files" || o.kind === "envelope",
  )) {
    const label = o.kind === "files" ? "files" : `${o.kind}-blob`;
    const hash = p.H(label, o.bytes);

    const h = headers.find((h) =>
      p.equal(
        hash,
        o.kind === "keyring" ? h.keyringHash : o.kind === "files" ? h.filesHash : h.envelopeHash,
      ),
    );

    check(h);

    if (o.kind !== "keyring") {
      if (o.kind === "envelope")
        semantics.set(`${o.path}/authentication`, "hash-verified; password envelope not decrypted");

      continue;
    }

    const key = epochKey(h.vaultId, h.epoch);

    if (!key) {
      semantics.set(`${o.path}/authentication`, "hash-verified; epoch key unavailable");
      continue;
    }

    const value = p.openKeyring(
      o.bytes,
      key,
      h.vaultId,
      h.epoch,
      commits(h.vaultId),
      idKeys.get(hex(h.vaultId)),
    );

    idKeys.set(hex(h.vaultId), value.idKey);
    keys.push(...value.older.map((old) => old.key));
    semantics.set(o.path, value);
  }

  observeFiles(objects, headers, idKeys, epochKey, semantics);
}

function observeFiles(
  objects: IRetained[],
  headers: p.IManifestHeader[],
  idKeys: Map<string, Uint8Array>,
  epochKey: (vault: Uint8Array, epoch: number) => Uint8Array | undefined,
  semantics: Map<string, unknown>,
): void {
  for (const o of objects.filter((o) => o.kind === "files")) {
    const h = headers.find((h) => p.equal(h.filesHash, p.H("files", o.bytes)))!;
    const idKey = idKeys.get(hex(h.vaultId));
    const files = p.decode(p.FilesCodec, o.bytes);
    const contents: unknown[] = [];

    for (const file of files.entries) {
      const key = epochKey(h.vaultId, file.epoch);

      if (!key || !idKey) {
        contents.push({ fileId: file.fileId, authentication: "epoch or ID key unavailable" });
        continue;
      }

      const context = {
        vaultId: h.vaultId,
        epoch: file.epoch,
        fileId: file.fileId,
        version: file.version,
      };

      const name = p.openFileName(file.name, key, idKey, context);

      const blob = objects.find(
        (o) => o.kind === "blob" && p.equal(p.H("blob", o.bytes), file.blobHash),
      );

      const content =
        blob && p.openFile(blob.bytes, key, idKey, context, file.blobHash, name).content;

      contents.push({
        fileId: file.fileId,
        ...name,
        ...(content ? { contentSha256: [...createHash("sha256").update(content).digest()] } : {}),
      });
    }

    semantics.set(`${o.path}/plaintext`, contents);
  }
}
