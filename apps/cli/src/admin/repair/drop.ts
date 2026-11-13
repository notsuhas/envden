import { revocationSwap } from "../devices/revocation.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdminContext } from "../shared/context.ts";
import type { THistory } from "../../vault/history.ts";
import { readHistory } from "../../vault/history.ts";

export async function dropDevices(context: TAdminContext, initial: THistory, without: string[]) {
  let history = initial;

  for (const name of without) {
    const device = [...history.state.devices.values()].find(
      (d) => d.name === name || p.base32(d.id) === name,
    );

    if (!device) continue;

    if (p.equal(device.id, context.identity.record.id) || history.state.devices.size === 1)
      throw new EnvdenError("INVALID_INPUT", "Cannot drop this device or the last device");

    const swap = await revocationSwap(context, history, device, context.now());
    await context.client.request("/v1/swap", "POST", p.SwapCodec.write(swap));

    history = await readHistory(context.client, context.vaultId);
  }

  return history;
}
