import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { createClient } from "../../client/request.ts";
import { hello } from "../../client/hello.ts";
import { readHistory } from "../../vault/history.ts";
import { saveState } from "../../state/repository.ts";
import { text } from "../../client/encoding.ts";
import { adminContext } from "../shared/context.ts";
import { checkFloor } from "../shared/history.ts";

export async function switchServer(
  adapters: TAdapters,
  address: string,
  now: () => number,
  fetcher: TFetch = fetch,
) {
  const context = await adminContext(adapters, now, fetcher);
  const server = await hello(address, undefined, fetcher, "0.0.0");

  const client = createClient({
    address,
    pin: server.pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now,
    fetcher,
    version: "0.0.0",
  });

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
  await saveState(adapters.home, context.local);
}
