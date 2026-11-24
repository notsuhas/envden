import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  Decrypter,
  generateHybridIdentity,
  generateX25519Identity,
  identityToRecipient,
} from "age-encryption";
import { unpackTar } from "modern-tar";
import { packBackup, sealBackup } from "../index.ts";

// Vendored from github.com/C2SP/CCTV at 4448f209, age/testdata (CC0).
const VECTORS = join(import.meta.dir, "cctv");

function readVector(name: string) {
  const raw = readFileSync(join(VECTORS, name));
  const split = raw.indexOf("\n\n");
  const fields = raw.subarray(0, split).toString("utf8").split("\n");

  const values = (key: string) =>
    fields.filter((line) => line.startsWith(`${key}: `)).map((line) => line.slice(key.length + 2));

  const body = raw.subarray(split + 2);

  return {
    expect: values("expect")[0],
    payload: values("payload")[0],
    identities: values("identity"),
    passphrases: values("passphrase"),
    file: new Uint8Array(values("compressed")[0] === "zlib" ? inflateSync(body) : body),
  };
}

describe("age vectors", () => {
  for (const name of readdirSync(VECTORS)) {
    test(name, async () => {
      const vector = readVector(name);
      const decrypter = new Decrypter();

      for (const identity of vector.identities) decrypter.addIdentity(identity);
      for (const passphrase of vector.passphrases) decrypter.addPassphrase(passphrase);

      const result = decrypter.decrypt(vector.file);

      if (vector.expect !== "success") return Promise.resolve(expect(result).rejects.toThrow());

      const payload = createHash("sha256")
        .update(await result)
        .digest("hex");

      expect(payload).toBe(vector.payload!);
    });
  }
});

const files = [
  { name: "github.com/acme/api/.env", bytes: new TextEncoder().encode("# db\n\nDB=x\nNO_EOL=1") },
  { name: "github.com/acme/api/apps/web/.env.local", bytes: Uint8Array.of(0x41, 0x3d, 0xff, 0xfe) },
];

async function openBackup(file: Uint8Array, decrypter: Decrypter) {
  const entries = await unpackTar(await decrypter.decrypt(file));

  return entries.filter((entry) => entry.header.type === "file");
}

test("a backup opens with each recipient or the passphrase, byte for byte", async () => {
  const tar = await packBackup(files, 0);
  const x25519 = await generateX25519Identity();
  const hybrid = await generateHybridIdentity();
  const recipients = [await identityToRecipient(x25519), await identityToRecipient(hybrid)];
  const sealed = await sealBackup({ kind: "recipients", recipients }, tar);

  for (const identity of [x25519, hybrid]) {
    const decrypter = new Decrypter();
    decrypter.addIdentity(identity);
    const entries = await openBackup(sealed, decrypter);

    expect(entries.map((entry) => [entry.header.name, entry.data])).toEqual(
      files.map((file) => [file.name, file.bytes]),
    );
  }

  const locked = await sealBackup({ kind: "passphrase", passphrase: "correct horse" }, tar);
  const decrypter = new Decrypter();
  decrypter.addPassphrase("correct horse");

  expect((await openBackup(locked, decrypter)).length).toBe(2);
  expect(new TextDecoder().decode(locked.subarray(0, 21))).toBe("age-encryption.org/v1");
});

test("only X25519 and hybrid age recipients are accepted", async () => {
  const valid = await identityToRecipient(await generateX25519Identity());

  const sealing = (recipient: string) =>
    sealBackup({ kind: "recipients", recipients: [recipient] }, new Uint8Array());

  for (const recipient of [
    valid.toUpperCase(),
    `${valid.slice(0, -1)}${valid.endsWith("q") ? "p" : "q"}`,
    "age1tag1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3dqk0v",
    "ssh-ed25519 AAAA",
    "",
  ])
    await Promise.resolve(
      expect(sealing(recipient)).rejects.toMatchObject({ code: "INVALID_INPUT" }),
    );
});
