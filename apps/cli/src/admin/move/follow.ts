import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TFetch } from "../../client/fetch.ts";
import type { TAdminContext } from "../shared/context.ts";
import type { THistory } from "../../vault/history.ts";
import { checkFloor } from "../shared/history.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { text } from "../../client/encoding.ts";
import { readHistory } from "../../vault/history.ts";
import { saveState } from "../../state/repository.ts";
import { VERSION } from "../../version.ts";

export async function followServerMove(
  context: TAdminContext,
  history: THistory,
  fetcher: TFetch,
  unlock?: (client: ReturnType<typeof createClient>, vaultId: Uint8Array) => Promise<void>,
) {
  checkFloor(context.local, history);
  const moved = history.entries.findLast((entry) => entry.body.kind === 5);
  if (!moved || moved.body.kind !== 5) return { kind: "unchanged" as const };
  const target = moved.body.payload;
  if (context.local.server?.pin === text(target.newPin)) return { kind: "unchanged" as const };

  const header = history.headers.find((h) =>
    p.equal(h.body.listHead, p.objectHash(p.EntryCodec, moved, "entry")),
  );

  if (!header || header.body.op !== 10)
    throw new EnvdenError("INVALID_DATA", "Move header missing");

  await hello(target.newAddress, target.newPin, fetcher, VERSION);

  const client = createClient({
    address: target.newAddress,
    pin: target.newPin,
    vaultId: context.vaultId,
    identity: context.identity,
    version: VERSION,
    now: context.now,
    fetcher,
  });

  const swap: p.ISwap = {
    expectedHead: header.body.prev,
    header,
    entries: [moved],
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    skPub: undefined,
    opaqueRecord: undefined,
    approver: undefined,
  };

  await client.request("/v1/swap", "POST", p.SwapCodec.write(swap));
  if (unlock) await unlock(client, context.vaultId);
  const destination = await readHistory(client, context.vaultId);

  checkFloor(
    {
      ...context.local,
      headers: history.headers.map((h) => text(p.signedCodec(p.ManifestHeaderCodec).write(h))),
    },
    destination,
  );

  if (!p.equal(destination.state.serverPin, target.newPin))
    throw new EnvdenError("INVALID_DATA", "Destination pin does not match the move");

  context.local.server = { address: target.newAddress, pin: text(target.newPin), protocol: 1 };
  await saveState(context.adapters.home, context.local);

  return { kind: "moved" as const, client };
}
