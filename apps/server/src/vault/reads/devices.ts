import { DevicesResponseSchema } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { requireGate } from "../../middleware/gates.ts";
import { vaultChain } from "../chain.ts";
import { text } from "../../http/encoding.ts";

export function readDevices(options: IAppOptions, auth: IAuth) {
  requireGate(options, auth, "unlocked");
  const vault = auth.request.vaultId;

  return DevicesResponseSchema.parse({
    devices: [...vaultChain(options.storage, vault).state.devices.values()].map((device) => {
      const seen = options.storage.device(vault, device.id)?.clientVersion;

      return { id: text(device.id), clientVersion: seen || null, confirmed: !!seen };
    }),
  });
}
