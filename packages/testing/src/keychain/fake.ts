import type { IKeychainAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakeKeychainAdapter(
  operations: { [K in keyof IKeychainAdapter]?: IKeychainAdapter[K] | undefined } = {},
): IKeychainAdapter {
  return {
    id: operations.id ?? "fake-keychain",
    ownerOnly: operations.ownerOnly?.bind(operations) ?? unexpected("keychain.ownerOnly"),
    get: operations.get?.bind(operations) ?? unexpected("keychain.get"),
    set: operations.set?.bind(operations) ?? unexpected("keychain.set"),
    delete: operations.delete?.bind(operations) ?? unexpected("keychain.delete"),
  };
}
