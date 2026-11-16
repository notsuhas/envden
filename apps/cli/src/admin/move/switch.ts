import { withStateLock } from "../../state/lock/lock.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { createClient, type TClient } from "../../client/request.ts";
import { hello } from "../../client/hello.ts";
import { readHistory } from "../../vault/history.ts";
import { saveState } from "../../state/store/repository.ts";
import type { ILocalState } from "../../state/model.ts";
import { text } from "../../client/encoding.ts";
import { adminContext } from "../shared/context.ts";
import { checkFloor } from "../shared/history.ts";
import { VERSION, MIN_SERVER } from "../../version.ts";

type TUnlock = (client: TClient, vaultId: Uint8Array) => Promise<ILocalState["session"]>;

async function destination(
  adapters: TAdapters,
  address: string,
  now: () => number,
  fetcher: TFetch,
) {
  const context = await adminContext(adapters, now, fetcher);
  const server = await hello(address, undefined, fetcher, MIN_SERVER);

  const client = createClient({
    address,
    pin: server.pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now,
    fetcher,
    version: VERSION,
  });

  return { context, server, client };
}

async function lockedswitchServer(
  adapters: TAdapters,
  address: string,
  now: () => number,
  fetcher: TFetch,
  session?: ILocalState["session"],
) {
  const { context, server, client } = await destination(adapters, address, now, fetcher);
  const history = await readHistory(client, context.vaultId);
  checkFloor(context.local, history);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);

  if (
    !moved ||
    moved.body.kind !== 5 ||
    !p.equal(moved.body.payload.newPin, server.pin) ||
    !p.equal(history.state.serverPin, server.pin)
  )
    throw new EnvdenError("INVALID_DATA", "Server has no verified move to this pin");

  context.local.server = { address, pin: text(server.pin), protocol: 1 };
  if (session) context.local.session = session;
  await saveState(adapters.home, context.local, adapters.now);
}

// The destination keeps its own unlock sessions, so a locked device logs in there, never at the old address.
export async function switchServer(
  adapters: TAdapters,
  address: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
  unlock?: TUnlock,
) {
  const attempt = (session?: ILocalState["session"]) =>
    withStateLock(adapters.home, () =>
      lockedswitchServer(adapters, address, now, fetcher, session),
    );

  try {
    return await attempt();
  } catch (error) {
    if (!unlock || !(error instanceof EnvdenError) || error.code !== "LOCKED") throw error;
  }

  // The password prompt runs outside the state lock so a retry never blocks other commands.
  const { context, client } = await destination(adapters, address, now, fetcher);

  return attempt(await unlock(client, context.vaultId));
}
