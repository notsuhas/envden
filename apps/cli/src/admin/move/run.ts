import { withStateLock } from "../../state/lock.ts";
import { moveCredentials } from "./credentials.ts";
import { abortMove } from "./abort.ts";
import { resumeMoveAddress } from "./resume.ts";
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { createClient } from "../../client/request.ts";
import { hello } from "../../client/hello.ts";
import { login } from "../../session/login.ts";
import { registerPassword } from "../../session/registration.ts";
import { atomicWrite, optionalRead } from "../../state/files.ts";
import { text } from "../../client/encoding.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { adminSwap } from "../shared/swap.ts";
import { copyServer } from "../shared/transfer.ts";
import { switchServer } from "./switch.ts";
import { VERSION } from "../../version.ts";

async function lockedmoveServer(
  adapters: TAdapters,
  options: {
    address?: string | undefined;
    token?: string | undefined;
    resume?: boolean | undefined;
    abort?: boolean | undefined;
    password: string;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const context = await adminContext(adapters, options.now, options.fetcher);
  await login(context.client, context.vaultId, options.password);
  const directory = join(adapters.home, "state");
  const savedAddress = await optionalRead(join(directory, "move-address"));
  let address = options.address ?? savedAddress;

  if (options.abort) {
    await abortMove(context, adapters, directory, address, options);

    return;
  }

  if (!address && options.resume) {
    address = await resumeMoveAddress(context, directory);
  }

  if (!address) throw new EnvdenError("INVALID_INPUT", "Specify the destination server");
  const { token, pin, tokenSlot } = await moveCredentials(adapters, directory, options);
  await hello(address, pin, options.fetcher, VERSION);

  const destination = createClient({
    address,
    pin,
    vaultId: context.vaultId,
    identity: context.identity,
    now: options.now,
    fetcher: options.fetcher,
    version: VERSION,
    ...(token
      ? {
          proof: (request: p.IRequest) =>
            p.tokenProof("setup", p.tokenKey("setup", token.secret), request),
        }
      : {}),
  });

  await atomicWrite(join(directory, "move-address"), address);
  await atomicWrite(join(directory, "move-pin"), text(pin));
  let swap: p.ISwap;

  swap = await preparedSwap(context, destination, directory, pin, address, options);

  requireDestination(swap, pin, address);

  await context.client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  await destination.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  await login(destination, context.vaultId, options.password);
  await switchServer(adapters, address, options.now, options.fetcher);
  await rm(join(directory, "move-swap.bin"), { force: true });
  await rm(join(directory, "move-address"), { force: true });
  await adapters.keychain.delete(tokenSlot);
}

export function moveServer(...args: Parameters<typeof lockedmoveServer>) {
  return withStateLock(args[0].home, () => lockedmoveServer(...args));
}

function requireDestination(swap: p.ISwap, pin: Uint8Array, address: string) {
  const move = swap.entries[0]?.body;

  if (move?.kind !== 5 || !p.equal(move.payload.newPin, pin) || move.payload.newAddress !== address)
    throw new EnvdenError("INVALID_INPUT", "Resume destination differs from the stored move");
}

async function preparedSwap(
  context: Awaited<ReturnType<typeof adminContext>>,
  destination: ReturnType<typeof createClient>,
  directory: string,
  pin: Uint8Array,
  address: string,
  options: Parameters<typeof lockedmoveServer>[1],
) {
  let swap: p.ISwap;

  try {
    swap = p.decode(p.SwapCodec, new Uint8Array(await readFile(join(directory, "move-swap.bin"))));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    await destination.request("/v1/move/session", "POST");
    await context.client.request("/v1/move/freeze", "POST");
    const history = await currentHistory(context);
    await copyServer(context.client, destination, history);
    await registerPassword(destination, context.vaultId, options.password);

    const entry = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: history.state.seq + 1n,
        parent: history.state.head,
        kind: 5,
        payload: { oldPin: history.state.serverPin, newPin: pin, newAddress: address },
        signer: context.identity.record.id,
      },
      context.identity.keys.objSk,
      "entry",
    );

    swap = adminSwap(history, context.identity, 10, options.now(), { entries: [entry] });
    await atomicWrite(join(directory, "move-swap.bin"), p.encode(p.SwapCodec, swap));
  }

  return swap;
}
