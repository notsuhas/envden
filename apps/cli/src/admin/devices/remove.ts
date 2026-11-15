import { withStateLock } from "../../state/lock/lock.ts";
import { revocationSwap } from "./revocation.ts";
import { retryHead } from "../../client/retry.ts";
import { exposedNames } from "./exposure.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { login } from "../../session/login.ts";
import { adminContext, type TAdminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { commitAdmin } from "../shared/commit.ts";
import { recoveryHolders } from "./recovery-holders.ts";
import { replaceKit, type IReplacementKit } from "../recovery/credentials.ts";
import { settlePendingKit } from "../recovery/pending.ts";

async function attemptRemoveDevice(
  adapters: TAdapters,
  name: string,
  password: string | (() => Promise<string>),
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
  newKit = false,
  recommend?: () => Promise<boolean>,
  confirm?: (exposure: Awaited<ReturnType<typeof exposedNames>>) => Promise<boolean>,
  onKit?: (kit: IReplacementKit) => Promise<void>,
) {
  const context = await adminContext(adapters, now, fetcher);
  const target = await removalTarget(context, name);
  if (!target) return { kind: "finished" as const };
  const { history, device } = target;

  const credential = typeof password === "string" ? password : await password();
  await login(context.client, context.vaultId, credential);
  const exposure = await exposedNames(context, history);

  if (confirm && !(await confirm(exposure)))
    throw new EnvdenError("INVALID_INPUT", "Device removal cancelled");

  const recommendNewKit = recoveryHolders(history).has(p.base32(device.id));

  const replace = newKit || (recommendNewKit && recommend ? await recommend() : false);

  if (replace) await replaceKit(adapters, credential, now, kitOutput(onKit), fetcher, device.id);
  else await commitAdmin(context, await revocationSwap(context, history, device, now()));

  return { kind: "removed" as const, recommendNewKit, exposure };
}

export function removeDevice(...args: Parameters<typeof attemptRemoveDevice>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRemoveDevice(...args)));
}

// A settled removal whose device is already gone counts as this removal finishing.
async function removalTarget(context: TAdminContext, name: string) {
  const finished = await settlePendingKit(context);
  const history = await currentHistory(context);
  if (finished && !findDevice(history, name)) return undefined;

  return { history, device: removableDevice(history, context.identity.record.id, name) };
}

function kitOutput(onKit?: (kit: IReplacementKit) => Promise<void>) {
  if (!onKit) throw new EnvdenError("INTERNAL", "Missing recovery kit output");

  return onKit;
}

function removableDevice(
  history: Awaited<ReturnType<typeof currentHistory>>,
  ownId: Uint8Array,
  name: string,
) {
  const device = findDevice(history, name);

  if (!device) throw new EnvdenError("NOT_FOUND", "Device not found");

  if (p.equal(device.id, ownId) || history.state.devices.size === 1)
    throw new EnvdenError("INVALID_INPUT", "Cannot remove this device or the last device");

  return device;
}

function findDevice(history: Awaited<ReturnType<typeof currentHistory>>, name: string) {
  return [...history.state.devices.values()].find(
    (item) => item.name === name || p.base32(item.id) === name,
  );
}
