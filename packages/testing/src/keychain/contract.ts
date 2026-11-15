import { describe, expect, test } from "bun:test";
import type { IKeychainAdapter } from "@envden/core/adapters";
import { withDirectory } from "../fixtures/directory.ts";

export function keychainContract(name: string, factory: (root: string) => IKeychainAdapter): void {
  describe(name, () => {
    test("missing and repeated deletion are harmless", () =>
      withDirectory(async (root) => {
        const adapter = factory(root);
        expect(await adapter.get("missing")).toBeUndefined();
        await adapter.delete("missing");
        await adapter.delete("missing");
        expect(await adapter.get("missing")).toBeUndefined();
      }));

    test("binary values, replacement, empty values and names stay isolated", () =>
      withDirectory(async (root) => {
        const adapter = factory(root);
        const bytes = new Uint8Array([0, 255, 128, 10]);
        await adapter.set("../key", bytes);
        bytes.fill(1);
        await adapter.set("other", new Uint8Array());
        expect(await adapter.get("../key")).toEqual(new Uint8Array([0, 255, 128, 10]));
        expect(await adapter.get("other")).toEqual(new Uint8Array());
        expect(await adapter.ownerOnly()).toBe(true);
        await adapter.set("../key", new Uint8Array([42]));
        expect(await adapter.get("../key")).toEqual(new Uint8Array([42]));
        await adapter.delete("../key");
        expect(await adapter.get("../key")).toBeUndefined();
        expect(await adapter.get("other")).toEqual(new Uint8Array());
      }));
  });
}
