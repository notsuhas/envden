import { EnvdenError } from "@envden/core/errors";
import type { INetworkAdapter } from "@envden/core/adapters";

const refuse = async (): Promise<never> => {
  throw new EnvdenError("INTERNAL", "No network adapter was supplied");
};

// a stand-in that never reaches a real network; callers override the methods they need
export function unsuppliedNetwork(): INetworkAdapter {
  return {
    id: "unsupplied",
    status: refuse,
    checkHttpsCertificate: refuse,
    expose: refuse,
    openPublicShare: refuse,
  };
}
