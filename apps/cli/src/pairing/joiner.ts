import { clearJoiner } from "./persistence/cleanup.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { withStateLock } from "../state/lock/lock.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { adoptRejoin, finishRejoinIdentity } from "../admin/rejoin/classify.ts";
import { getSlot, putSlot } from "./exchange.ts";
import { text, binary } from "../client/encoding.ts";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { readHistory } from "../vault/history.ts";
import { acceptJoin } from "../vault/join/accept.ts";

async function lockedexchangeJoiner(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  pin: Uint8Array,
  code: string,
  wait: (expiresAt: number) => Promise<void>,
): Promise<void> {
  const normalized = p.normalizePairingCode(code);
  const start = await p.opaqueStartLogin(normalized.password);
  const expiresAt = await putSlot(client, normalized.mailbox, "KE1", start.startLoginRequest);
  await wait(expiresAt);

  const finish = await p.opaqueFinishLogin({
    password: normalized.password,
    clientLoginState: start.clientLoginState,
    loginResponse: await getSlot(client, normalized.mailbox, "KE2"),
    identifiers: p.pairingIdentifiers(pin, normalized.mailbox).identifiers,
  });

  if (!finish) throw new EnvdenError("UNAUTHORIZED", "Incorrect pairing code; make a new code");
  const session = binary(finish.sessionKey);
  const keys = p.pairingChannelKeys(session);
  session.fill(0);

  const message = p.sealPairJoiner({ device: identity.record }, keys.joinerToApprover);

  await withStateLock(adapters.home, async () => {
    await adapters.keychain.set(`envden/${adapters.home}/pair-receive`, keys.approverToJoiner);

    await atomicWrite(
      join(adapters.home, "state", "pair-joiner"),
      JSON.stringify({
        mailbox: normalized.mailbox,
        ke3: finish.finishLoginRequest,
        message: text(message),
      }),
    );
  });

  try {
    await putSlot(client, normalized.mailbox, "KE3", finish.finishLoginRequest);
    await putSlot(client, normalized.mailbox, "PairJoiner", text(message));
  } finally {
    keys.joinerToApprover.fill(0);
    keys.approverToJoiner.fill(0);
  }
}

async function lockedresumeJoiner(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  rejoin = false,
) {
  const key = await adapters.keychain.get(`envden/${adapters.home}/pair-receive`);

  if (!key) throw new EnvdenError("NOT_FOUND", "No pairing exchange to resume");

  try {
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

    for (const file of ["pair-pin", "pair-joiner", "pair-expiry"])
      await rm(join(adapters.home, "state", file), { force: true });

    return state;
  } finally {
    key.fill(0);
  }
}

export async function exchangeJoiner(...args: Parameters<typeof lockedexchangeJoiner>) {
  try {
    return await lockedexchangeJoiner(...args);
  } catch (error) {
    if (!(await optionalRead(join(args[0].home, "state", "pair-joiner")))) {
      await withStateLock(args[0].home, () => clearJoiner(args[0]));

      if (error instanceof EnvdenError && error.code === "BUSY")
        throw new EnvdenError("BUSY", "Pairing timed out before login; create a new pairing code");
    }

    if (
      error instanceof EnvdenError &&
      ["UNAUTHORIZED", "CONFLICT", "INVALID_DATA", "NOT_FOUND"].includes(error.code)
    )
      await withStateLock(args[0].home, () => clearJoiner(args[0]));

    throw error;
  }
}

export function resumeJoiner(...args: Parameters<typeof lockedresumeJoiner>) {
  return withStateLock(args[0].home, async () => {
    try {
      return await lockedresumeJoiner(...args);
    } catch (error) {
      if (
        error instanceof EnvdenError &&
        ["INVALID_DATA", "FORK", "UNAUTHORIZED"].includes(error.code)
      )
        await clearJoiner(args[0]);

      throw error;
    }
  });
}

export async function resendJoiner(adapters: TAdapters, client: TClient) {
  const saved = await optionalRead(join(adapters.home, "state", "pair-joiner"));
  if (!saved) return;
  const value: unknown = JSON.parse(saved);

  if (
    !value ||
    typeof value !== "object" ||
    !("mailbox" in value) ||
    typeof value.mailbox !== "number" ||
    !("ke3" in value) ||
    typeof value.ke3 !== "string" ||
    !("message" in value) ||
    typeof value.message !== "string"
  )
    throw new EnvdenError("INVALID_DATA", "Invalid stored pairing exchange");

  try {
    await putSlot(client, value.mailbox, "KE3", value.ke3);
    await putSlot(client, value.mailbox, "PairJoiner", value.message);
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "NOT_FOUND") throw error;
  }
}
