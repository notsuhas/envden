import { joinLocalState } from "../join/local-state.ts";
import { join } from "node:path";
import { optionalRead, atomicWrite } from "../../state/store/files.ts";
import { loadState } from "../../state/store/repository.ts";
import { rejoinIdentity, checkRejoin } from "../../admin/rejoin/classify.ts";
import type { TFetch } from "../../client/fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { binary, text } from "../../client/encoding.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { readHistory } from "../history.ts";
import { VERSION, MIN_SERVER } from "../../version.ts";

export interface IRecoveryJoin {
  rejoin?: boolean;
  address: string;
  code: string;
  name: string;
  now: () => number;
  fetcher: TFetch;
}

export async function prepareRecoveryJoin(adapters: TAdapters, options: IRecoveryJoin) {
  const code = p.decodeRecoveryCode(options.code);
  const proofPub = p.proofPub(code);
  const server = await hello(options.address, undefined, options.fetcher, MIN_SERVER);
  const pending = join(adapters.home, "state", "recovery-join");

  const attempt = JSON.stringify({
    proofPub: p.base32(proofPub),
    pin: p.base32(server.pin),
    name: options.name,
  });

  const resuming = (await optionalRead(pending)) === attempt;
  const local = await loadState(adapters.home);

  // The vault isn't known until the ticket, so a committed one here can only be refused.
  if (!options.rejoin && local?.vaultId && !local.creationPending)
    throw new EnvdenError("CONFLICT", "Device is already configured for another vault");

  const identity = options.rejoin
    ? await rejoinIdentity(adapters, options.name)
    : await deviceIdentity(
        adapters.keychain,
        adapters.home,
        options.name,
        !resuming && !local?.checkpoint,
      );

  await atomicWrite(pending, attempt, adapters.now);

  const client = (vaultId: Uint8Array, proof?: (request: p.IRequest) => Uint8Array) =>
    createClient({
      address: options.address,
      pin: server.pin,
      vaultId,
      identity,
      version: VERSION,
      now: options.now,
      fetcher: options.fetcher,
      ...(proof ? { proof } : {}),
    });

  // The server finds the vault by the proof key, since the user holds only the code.
  const ticket = await client(new Uint8Array(32), (request) =>
    p.signRecoveryProof(code, request),
  ).request("/v1/recovery/ticket", "POST", { proofPub: text(proofPub) });

  const vaultId = binary(p.RecoveryTicketResponseSchema.parse(await ticket.json()).vaultId);
  await joinLocalState(adapters.home, p.base32(vaultId));
  const member = client(vaultId);
  const history = await readHistory(member, vaultId);

  if (!p.equal(history.state.serverPin, server.pin)) throw movedError(history);

  if (options.rejoin) await checkRejoin(adapters, history);

  return { vaultId, code, server, pending, resuming, identity, client: member, history };
}

// The signed device list names where the vault went, so the user can retry there.
function movedError(history: Awaited<ReturnType<typeof readHistory>>) {
  const moved = history.entries.findLast((entry) => entry.body.kind === 5)?.body;
  const address = moved?.kind === 5 ? moved.payload.newAddress : undefined;

  return new EnvdenError(
    "MOVING",
    address
      ? `Vault moved to ${address}; run envden join ${address} --recovery`
      : "Vault moved; use its current server address",
  );
}
