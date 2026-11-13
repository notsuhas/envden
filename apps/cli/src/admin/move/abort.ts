import { withStateLock } from "../../state/lock/lock.ts";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { createClient } from "../../client/request.ts";
import { optionalRead } from "../../state/store/files.ts";
import { binary } from "../../client/encoding.ts";
import { currentHistory } from "../shared/history.ts";

import type { TAdminContext } from "../shared/context.ts";
import { VERSION } from "../../version.ts";

async function lockedabortMove(
  context: TAdminContext,
  adapters: TAdapters,
  directory: string,
  address: string | undefined,
  options: { now: () => number; fetcher: TFetch },
) {
  const history = await currentHistory(context);

  if (!p.equal(history.state.serverPin, binary(context.local.server!.pin)))
    throw new EnvdenError("MOVING", "Move already committed; resume it instead");

  if (address) {
    const savedPin = await optionalRead(join(directory, "move-pin"));
    if (!savedPin) throw new EnvdenError("INVALID_DATA", "Missing move pin");

    const destination = createClient({
      address,
      pin: binary(savedPin),
      vaultId: context.vaultId,
      identity: context.identity,
      now: options.now,
      fetcher: options.fetcher,
      version: VERSION,
    });

    try {
      await destination.request("/v1/move/discard", "POST");
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "NOT_FOUND") throw error;
    }
  }

  await context.client.request("/v1/move/unfreeze", "POST");
  await rm(join(directory, "move-address"), { force: true });
  await rm(join(directory, "move-swap.bin"), { force: true });

  await rm(join(directory, "move-pin"), { force: true });
  await adapters.keychain.delete(`envden/${adapters.home}/move-token`);
}

export function abortMove(...args: Parameters<typeof lockedabortMove>) {
  return withStateLock(args[0].adapters.home, () => lockedabortMove(...args));
}
