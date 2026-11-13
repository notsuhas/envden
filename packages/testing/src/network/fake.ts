import type { INetworkAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakeNetworkAdapter(
  operations: { [K in keyof INetworkAdapter]?: INetworkAdapter[K] | undefined } = {},
): INetworkAdapter {
  return {
    id: operations.id ?? "fake-network",
    status: operations.status?.bind(operations) ?? unexpected("network.status"),
    checkHttpsCertificate:
      operations.checkHttpsCertificate?.bind(operations) ??
      unexpected("network.checkHttpsCertificate"),
    expose: operations.expose?.bind(operations) ?? unexpected("network.expose"),
  };
}
