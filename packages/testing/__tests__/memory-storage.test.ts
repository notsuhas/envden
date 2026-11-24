import { expect, test } from "bun:test";
import { storageContract, createMemoryStorageAdapter } from "../src/storage/index.ts";

storageContract("Memory storage", () => {
  const storage = createMemoryStorageAdapter([
    "vaultIds",
    "hasBlob",
    "findCommitted",
    "close",
    "transaction",
    "hasVault",
    "vault",
    "configureVault",
    "discardInactiveVault",
    "head",
    "commitSwap",
    "headers",
    "header",
    "entries",
    "fileList",
    "state",
    "states",
    "writeState",
    "device",
    "putDevice",
    "putBlob",
    "getBlob",
    "blobHashes",
    "vaultUsage",
    "prune",
    "setupToken",
    "setSetupToken",
    "putSession",
    "session",
    "consumeSession",
    "charge",
    "refund",
    "openJoinRequest",
    "joinRequests",
    "joinRequest",
    "writeJoinRequest",
    "closeJoinRequest",
    "approver",
    "rememberNonce",
  ]);

  return { storage, reopen: () => storage, dispose: () => storage.close() };
});

test("memory storage rejects unspecified calls and rolls back transactions", () => {
  const storage = createMemoryStorageAdapter(["transaction", "setSetupToken", "setupToken"]);
  expect(() => storage.head(new Uint8Array())).toThrow("Unexpected fake operation: storage.head");

  expect(() =>
    storage.transaction(() => {
      storage.setSetupToken(new Uint8Array([1]));
      throw new Error("Abort transaction");
    }),
  ).toThrow("Abort transaction");

  expect(storage.setupToken()).toBeUndefined();
});
