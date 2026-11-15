import { withStateLock } from "../../state/lock/lock.ts";
import { retryHead } from "../../client/retry.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { adminSwap } from "../shared/swap.ts";
import { commitAdmin } from "../shared/commit.ts";

export function renameCheck(
  devices: Iterable<p.IDeviceRecord>,
  ownId: Uint8Array,
  name: string,
): "rename" | "unchanged" | "taken" | "invalid" {
  if (!p.isDeviceName(name)) return "invalid";

  const holder = [...devices].find((device) => device.name === name);
  if (!holder) return "rename";

  return p.equal(holder.id, ownId) ? "unchanged" : "taken";
}

async function attemptRenameDevice(
  adapters: TAdapters,
  name: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const own = context.identity.record.id;
  const check = renameCheck(history.state.devices.values(), own, name);

  if (check === "unchanged") return { kind: "unchanged" as const };
  if (check === "taken") throw new EnvdenError("INVALID_INPUT", "Another device has that name");

  if (check === "invalid")
    throw new EnvdenError(
      "INVALID_INPUT",
      "Device names are 1-64 bytes with no invisible characters",
    );

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 7,
      payload: { device: own, name },
      signer: own,
    },
    context.identity.keys.objSk,
    "entry",
  );

  await commitAdmin(context, adminSwap(history, context.identity, 13, now(), { entries: [entry] }));

  return { kind: "renamed" as const };
}

export function renameDevice(...args: Parameters<typeof attemptRenameDevice>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRenameDevice(...args)));
}
