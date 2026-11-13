import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { adoptRejoin, finishRejoinIdentity } from "../admin/rejoin/classify.ts";
import { getSlot, putSlot } from "./exchange.ts";
import { text, binary } from "../client/encoding.ts";
import { atomicWrite, optionalRead } from "../state/files.ts";
import { join } from "node:path";
import { readHistory } from "../vault/history.ts";
import { acceptJoin } from "../vault/join/accept.ts";

export async function exchangeJoiner(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  pin: Uint8Array,
  code: string,
  wait: () => Promise<void>,
): Promise<void> {
  const normalized = p.normalizePairingCode(code);
  const start = await p.opaqueStartLogin(normalized.password);
  await putSlot(client, normalized.mailbox, "KE1", start.startLoginRequest);
  await wait();

  const finish = await p.opaqueFinishLogin({
    password: normalized.password,
    clientLoginState: start.clientLoginState,
    loginResponse: await getSlot(client, normalized.mailbox, "KE2"),
    identifiers: p.pairingIdentifiers(pin, normalized.mailbox).identifiers,
  });

  if (!finish) throw new EnvdenError("UNAUTHORIZED", "Incorrect pairing code; make a new code");
  const keys = p.pairingChannelKeys(binary(finish.sessionKey));
  await adapters.keychain.set(`envden/${adapters.home}/pair-receive`, keys.approverToJoiner);
  const message = p.sealPairJoiner({ device: identity.record }, keys.joinerToApprover);
  await atomicWrite(join(adapters.home, "state", "pair-joiner"), text(message));
  await putSlot(client, normalized.mailbox, "KE3", finish.finishLoginRequest);
  await putSlot(client, normalized.mailbox, "PairJoiner", text(message));
  keys.joinerToApprover.fill(0);
}

export async function resumeJoiner(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  rejoin = false,
) {
  const key = await adapters.keychain.get(`envden/${adapters.home}/pair-receive`);

  if (!key || !(await optionalRead(join(adapters.home, "state", "pair-joiner"))))
    throw new EnvdenError("NOT_FOUND", "No pairing exchange to resume");

  const response = p.MessageResponseSchema.parse(
    await (await client.request("/v1/pairing/approver")).json(),
  );

  const approver = p.openPairApprover(binary(response.message), key);

  if (!p.equal(approver.serverPin, pin))
    throw new EnvdenError("UNAUTHORIZED", "Pairing server pin mismatch");

  const historyClient = client.forVault(approver.vaultId);
  const history = await readHistory(historyClient, approver.vaultId);

  if (rejoin) await adoptRejoin(adapters, history);

  const state = await acceptJoin(
    adapters,
    historyClient,
    identity,
    address,
    pin,
    history,
    approver.manifestHash,
  );

  if (rejoin) await finishRejoinIdentity(adapters);
  await adapters.keychain.delete(`envden/${adapters.home}/pair-receive`);
  key.fill(0);

  return state;
}
