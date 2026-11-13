import type { IKeychainAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakeKeychainAdapter(
  operations: { [K in keyof IKeychainAdapter]?: IKeychainAdapter[K] | undefined } = {},
): IKeychainAdapter {
  return {
    id: operations.id ?? "fake-keychain",
    available: operations.available?.bind(operations) ?? unexpected("keychain.available"),
    get: operations.get?.bind(operations) ?? unexpected("keychain.get"),
    set: operations.set?.bind(operations) ?? unexpected("keychain.set"),
    delete: operations.delete?.bind(operations) ?? unexpected("keychain.delete"),
  };
}
