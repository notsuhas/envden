import { mock } from "bun:test";
import * as fs from "node:fs";

const originalWrite = fs.writeFileSync;
const originalSync = fs.fsyncSync;
const dir = process.argv[2];
const stage = process.argv[3];

if (!dir) throw new Error("Missing data directory");

let syncs = 0;

await mock.module("node:fs", () => ({
  ...fs,
  writeFileSync(...args: Parameters<typeof fs.writeFileSync>) {
    if (stage === "partial") {
      originalWrite(args[0], new Uint8Array([3]));
      process.exit(77);
    }

    return originalWrite(...args);
  },
  fsyncSync(fd: number) {
    originalSync(fd);
    if (++syncs === 2) process.exit(77);
  },
}));

const { createSqliteStorageAdapter } = await import("../index.ts");
const storage = createSqliteStorageAdapter(dir, 0);

storage.putBlob(new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3, 4, 5]));

throw new Error("Crash injection did not execute");
