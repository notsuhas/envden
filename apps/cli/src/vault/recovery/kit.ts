import { withStateLock } from "../../state/lock/lock.ts";
import { recoveryEpochKey } from "./key.ts";
import {
  rejoinIdentity,
  checkRejoin,
  adoptRejoin,
  finishRejoinIdentity,
} from "../../admin/rejoin/classify.ts";
import { retryHead } from "../../client/retry.ts";
import type { TFetch } from "../../client/fetch.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { hello } from "../../client/hello.ts";
import { createClient } from "../../client/request.ts";
import { deviceIdentity } from "../../identity/device.ts";
import { login } from "../../session/login.ts";
import { readHistory } from "../history.ts";
import { addDeviceSwap } from "../add.ts";
import { acceptJoin } from "../join/accept.ts";
import { VERSION } from "../../version.ts";

async function attemptKitJoin(
  adapters: TAdapters,
  options: {
    rejoin?: boolean;
    address: string;
    vaultId: string;
    secretKey: string;
    password: string;
    name: string;
    now: () => number;
    fetcher: TFetch;
  },
) {
  const vaultId = p.unbase32(options.vaultId);
  const secret = p.decodeSecretKey(options.secretKey);
  const server = await hello(options.address, undefined, options.fetcher, VERSION);

  const identity = options.rejoin
    ? await rejoinIdentity(adapters, options.name)
    : await deviceIdentity(adapters.keychain, adapters.home, options.name);

  const client = createClient({
    address: options.address,
    pin: server.pin,
    vaultId,
    identity,
    version: VERSION,
    now: options.now,
    fetcher: options.fetcher,
  });

  await login(client, vaultId, options.password, "kit");
  const history = await readHistory(client, vaultId);

  if (!p.equal(history.state.serverPin, server.pin))
    throw new EnvdenError("MOVING", "Vault moved; use its current server address");

  if (options.rejoin) await checkRejoin(adapters, history);
  const head = history.headers.at(-1)!;
  const box = new Uint8Array(await (await client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const envelope = await p.openEnvelope(box, options.password, secret, vaultId);
  secret.fill(0);
  const recoveryKeys = { encSk: envelope.recoveryEncSk, objSk: envelope.recoveryObjSk };

  try {
    const recovery = history.state.recovery;
    const epochKey = await recoveryEpochKey(history, envelope, recoveryKeys, vaultId);

    const swap = await addDeviceSwap(
      history,
      identity.record,
      recovery.id,
      recoveryKeys.objSk,
      epochKey,
      3,
      options.now(),
      { id: identity.record.id, sk: identity.keys.objSk },
    );

    if (!p.verifyObject(p.EntryCodec, swap.entries[0]!, recovery.objPub, "entry").ok)
      throw new EnvdenError("INVALID_DATA", "Recovery key is no longer current");

    await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
    const updated = await readHistory(client, vaultId);

    if (options.rejoin) await adoptRejoin(adapters, updated);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      updated,
      p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);

    return accepted;
  } finally {
    recoveryKeys.encSk.fill(0);
    recoveryKeys.objSk.fill(0);
  }
}

function lockedkitJoin(...args: Parameters<typeof attemptKitJoin>) {
  return retryHead(() => attemptKitJoin(...args));
}

export function kitJoin(...args: Parameters<typeof lockedkitJoin>) {
  return withStateLock(args[0].home, () => lockedkitJoin(...args));
}
