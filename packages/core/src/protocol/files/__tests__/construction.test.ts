import { test, expect } from "bun:test";
import * as p from "../../index.ts";
import vector from "../../__tests__/vectors/protocol.json";

const from = (s: string) => Uint8Array.from(Buffer.from(s, "hex"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const rng = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

const key = from(vector.key),
  vaultId = from(vector.vaultId);

const context = { vaultId, epoch: 1, fileId: from(vector.fileId), version: 1n };

const file = {
  repoId: "repo",
  path: "folder/.env",
  content: new TextEncoder().encode("SECRET=value\n"),
};

test("file blob and name vectors, bound metadata and identity", () => {
  expect(hex(p.sealFile(file, key, context, rng))).toBe(vector.fileBox);
  expect(hex(p.sealFileName(file, key, context, rng))).toBe(vector.fileNameBox);

  const box = from(vector.fileBox),
    name = p.openFileName(from(vector.fileNameBox), key, key, context);

  expect(p.openFile(box, key, key, context, p.H("blob", box), name)).toEqual(file);

  expect(() =>
    p.openFile(box, key, key, { ...context, version: 2n }, p.H("blob", box), name),
  ).toThrow();

  expect(() => p.openFile(box, key, new Uint8Array(32), context, p.H("blob", box), name)).toThrow();
  expect(() => p.openFile(box, key, key, context, new Uint8Array(32), name)).toThrow();

  expect(() =>
    p.openFile(box, key, key, context, p.H("blob", box), { ...name, path: "other" }),
  ).toThrow();

  expect(() =>
    p.openFileName(from(vector.fileNameBox), key, new Uint8Array(32), context),
  ).toThrow();
});

test("paths are portable relative NFC paths before file identity derivation", () => {
  for (const path of [
    "/root",
    "a//b",
    "a/./b",
    "a/../b",
    "C:secret",
    "a:x",
    "a\\b",
    "a./b",
    "a /b",
    "CON",
    "nul.env",
    "dir/COM1.txt",
    "LPT9",
    "a\u0001b",
    "a\u0085b",
    "e\u0301",
  ])
    expect(() => p.fileId(key, "repo", path)).toThrow();

  for (const path of ["folder/.env", "é/.env", "console.env", "COM10.env"])
    expect(() => p.validatePath(path)).not.toThrow();
});
