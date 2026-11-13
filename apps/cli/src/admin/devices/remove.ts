import { revocationSwap } from "./revocation.ts";
import { retryHead } from "../../client/retry.ts";
import { exposedNames } from "./exposure.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { login } from "../../session/login.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { commitAdmin } from "../shared/commit.ts";
import { recoveryHolders } from "./recovery-holders.ts";
import { replaceKit } from "../recovery/credentials.ts";

async function attemptRemoveDevice(
  adapters: TAdapters,
  name: string,
  password: string,
  now: () => number,
  fetcher: TFetch = fetch,
  newKit = false,
) {
  const context = await adminContext(adapters, now, fetcher);
  await login(context.client, context.vaultId, password);
  const history = await currentHistory(context);

  const device = [...history.state.devices.values()].find(
    (item) => item.name === name || p.base32(item.id) === name,
  );

  if (!device) throw new EnvdenError("NOT_FOUND", "Device not found");

  if (p.equal(device.id, context.identity.record.id) || history.state.devices.size === 1)
    throw new EnvdenError("INVALID_INPUT", "Cannot remove this device or the last device");

  const exposure = await exposedNames(context, history);
  const recommendNewKit = recoveryHolders(history).has(p.base32(device.id));

  if (newKit)
    return {
      recommendNewKit,
      exposure,
      kit: await replaceKit(adapters, password, now, fetcher, device.id),
    };

  await commitAdmin(context, await revocationSwap(context, history, device, now()));

  return { recommendNewKit, exposure };
}

export function removeDevice(...args: Parameters<typeof attemptRemoveDevice>) {
  return retryHead(() => attemptRemoveDevice(...args));
}
