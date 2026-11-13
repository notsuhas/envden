import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import {
  createFakeKeychainAdapter,
  createMemoryKeychainAdapter,
  keychainContract,
} from "../src/keychain/index.ts";
import { createFakePlacementAdapter } from "../src/placement/index.ts";
import { createFakeRepoAdapter } from "../src/repo/index.ts";
import { createFakeNetworkAdapter } from "../src/network/index.ts";
import { createFakeShellAdapter } from "../src/shell/index.ts";
import { createFakeStorageAdapter } from "../src/storage/index.ts";

keychainContract("Memory keychain", () =>
  createMemoryKeychainAdapter(["available", "get", "set", "delete"]),
);

for (const [kind, fake] of [
  ["keychain", createFakeKeychainAdapter()],
  ["placement", createFakePlacementAdapter()],
  ["repo", createFakeRepoAdapter()],
  ["network", createFakeNetworkAdapter()],
  ["shell", createFakeShellAdapter()],
  ["storage", createFakeStorageAdapter()],
] as const) {
  test(`${kind} fake rejects every unspecified operation`, () => {
    for (const [operation, value] of Object.entries(fake)) {
      if (typeof value === "function")
        expect(() => value()).toThrow(`Unexpected fake operation: ${kind}.${operation}`);
    }
  });
}

test("fake operations use supplied handlers and preserve failures", async () => {
  const failure = new Error("Injected failure");
  const keychain = createFakeKeychainAdapter({ get: async () => new Uint8Array([7]) });
  expect(await keychain.get("key")).toEqual(new Uint8Array([7]));
  const repo = createFakeRepoAdapter({ checkoutAt: async () => undefined });
  expect(await repo.checkoutAt("outside")).toBeUndefined();
  const placement = createFakePlacementAdapter({ inspect: async () => "detached" });
  expect(await placement.inspect("store", "checkout")).toBe("detached");

  const network = createFakeNetworkAdapter({
    expose: async () => {
      throw failure;
    },
  });

  await rejects(network.expose(8080), failure);
  const shell = createFakeShellAdapter({ rcPath: () => "/tmp/profile" });
  expect(shell.rcPath()).toBe("/tmp/profile");
  const storage = createFakeStorageAdapter({ head: () => new Uint8Array([8]) });
  expect(storage.head(new Uint8Array([1]))).toEqual(new Uint8Array([8]));
});

test("memory keychain requires explicit operations and returns independent bytes", async () => {
  const adapter = createMemoryKeychainAdapter(["get", "set"]);
  expect(() => adapter.available()).toThrow("Unexpected fake operation");
  await adapter.set("key", new Uint8Array([1]));
  const value = await adapter.get("key");
  value?.fill(9);
  expect(await adapter.get("key")).toEqual(new Uint8Array([1]));
});
