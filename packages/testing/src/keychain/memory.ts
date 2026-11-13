import type { IKeychainAdapter } from "@envden/core/adapters";
import { createFakeKeychainAdapter } from "./fake.ts";

export function createMemoryKeychainAdapter(
  operations: readonly (keyof IKeychainAdapter)[],
): IKeychainAdapter {
  const values = new Map<string, Uint8Array>();

  return createFakeKeychainAdapter({
    available: operations.includes("available") ? async () => true : undefined,
    get: operations.includes("get") ? async (name) => values.get(name)?.slice() : undefined,
    set: operations.includes("set")
      ? async (name, value) => {
          values.set(name, value.slice());
        }
      : undefined,
    delete: operations.includes("delete")
      ? async (name) => {
          values.delete(name);
        }
      : undefined,
  });
}
