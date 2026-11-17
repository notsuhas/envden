import { Database } from "bun:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import * as p from "@envden/core/protocol";
import { integrityFixture } from "./integrity.ts";

export async function retainedFixture(
  home: string,
  seed: number,
  mutation?: string,
  sqlite = false,
) {
  const f = integrityFixture(seed, mutation === "plaintext" ? "SECRET=changed\n" : undefined);

  if (mutation === "aead") {
    f.blob[f.blob.length - 1] = f.blob[f.blob.length - 1]! ^ 1;
    const list = p.decode(p.FilesCodec, f.files);
    list.entries[0]!.blobHash = p.H("blob", f.blob);
    f.files = p.encode(p.FilesCodec, list);

    f.header = p.signObject(
      p.ManifestHeaderCodec,
      { ...f.header.body, filesHash: p.H("files", f.files) },
      f.signingKey,
      "manifest",
    );
  }

  if (mutation === "keyring-aead") {
    f.keyring[f.keyring.length - 1] = f.keyring[f.keyring.length - 1]! ^ 1;

    f.header = p.signObject(
      p.ManifestHeaderCodec,
      { ...f.header.body, keyringHash: p.H("keyring-blob", f.keyring) },
      f.signingKey,
      "manifest",
    );
  }

  const state = join(home, "state");
  await mkdir(join(state, "keys"), { recursive: true });
  await mkdir(join(state, "headers"));
  await mkdir(join(state, "blobs"));
  const entryCodec = p.signedCodec(p.EntryCodec);
  const headerCodec = p.signedCodec(p.ManifestHeaderCodec);
  const entries = [f.genesis, f.epoch].map((e) => Buffer.from(p.encode(entryCodec, e)));
  const header = Buffer.from(p.encode(headerCodec, f.header));
  const blob = Buffer.from(f.blob);
  const keyring = Buffer.from(f.keyring);
  const files = Buffer.from(f.files);
  const target = { entry: entries[1], header, blob, keyring, files }[mutation ?? ""];
  if (target && !sqlite) target[target.length - 1] = target[target.length - 1]! ^ 1;
  if (mutation === "cached-state") f.state.serverPin = new Uint8Array(32).fill(255);
  const token = header.toString("base64url");
  const ref = createHash("sha256").update(token).digest("hex");
  await writeFile(join(state, "headers", ref), token);
  await writeFile(join(state, "keys", "epoch.key"), f.key);
  await writeFile(join(state, "blobs", Buffer.from(p.H("blob", f.blob)).toString("hex")), blob);

  await writeFile(
    join(state, "device.json"),
    JSON.stringify(
      {
        entries: entries.map((e) => e.toString("base64url")),
        headerRefs: [ref],
        verifiedState: f.state,
        keyring: keyring.toString("base64url"),
        files: files.toString("base64url"),
      },
      (_key, value: unknown) => {
        if (value instanceof Uint8Array)
          return { $bytes: Buffer.from(value).toString("base64url") };

        if (typeof value === "bigint") return { $bigint: String(value) };
        if (value instanceof Map) return { $map: [...value] };
        if (value instanceof Set) return { $set: [...value] };

        return value;
      },
    ),
  );

  if (!sqlite) return;

  if (target) target[target.length - 1] = target[target.length - 1]! ^ 1;

  if (mutation === "blob") {
    const server = join(
      home,
      "server",
      "blobs",
      Buffer.from(f.header.body.vaultId).toString("hex"),
    );

    await mkdir(server, { recursive: true });
    await writeFile(join(server, Buffer.from(p.H("blob", f.blob)).toString("hex")), blob);
  }

  const db = new Database(join(home, "envden.sqlite"));

  try {
    db.run(
      "CREATE TABLE entries (hash BLOB, bytes BLOB); CREATE TABLE headers (hash BLOB, bytes BLOB); CREATE TABLE lists (hash BLOB, bytes BLOB); CREATE TABLE state (kind TEXT, key BLOB, bytes BLOB)",
    );

    for (const [i, entry] of entries.entries())
      db.run("INSERT INTO entries VALUES (?, ?)", [
        p.objectHash(p.EntryCodec, [f.genesis, f.epoch][i]!, "entry"),
        entry,
      ]);

    db.run("INSERT INTO headers VALUES (?, ?)", [
      p.objectHash(p.ManifestHeaderCodec, f.header, "manifest"),
      header,
    ]);

    db.run("INSERT INTO lists VALUES (?, ?)", [p.H("files", f.files), files]);
    db.run("INSERT INTO state VALUES ('keyring', ?, ?)", [p.H("keyring-blob", f.keyring), keyring]);
  } finally {
    db.close();
  }
}
