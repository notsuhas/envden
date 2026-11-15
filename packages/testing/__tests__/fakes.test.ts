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
  createMemoryKeychainAdapter(["ownerOnly", "get", "set", "delete"]),
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

test("memory keychain requires explicit operations and returns independent bytes", async () => {
  const adapter = createMemoryKeychainAdapter(["get", "set"]);
  expect(() => adapter.ownerOnly()).toThrow("Unexpected fake operation");
  await adapter.set("key", new Uint8Array([1]));
  const value = await adapter.get("key");
  value?.fill(9);
  expect(await adapter.get("key")).toEqual(new Uint8Array([1]));
});
