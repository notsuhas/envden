import { readIdentity } from "../identity/stored.ts";
import { refuseCommittedJoin } from "./guard.ts";
import { clearJoiner } from "./persistence/cleanup.ts";
import { saveJoiner, type TJoiner } from "./persistence/joiner.ts";
import { withStateLock } from "../state/lock/lock.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { adoptRejoin, finishRejoinIdentity } from "../admin/rejoin/classify.ts";
import { cancelRequest, putSlot, requestDeadline } from "./exchange.ts";
import { fetchApproved, pauseBriefly, waitMessage, type TPause } from "./wait.ts";
import { text, binary } from "../client/encoding.ts";
import { readHistory } from "../vault/history.ts";
import { acceptJoin } from "../vault/join/accept.ts";

export interface IJoinerInteraction {
  confirm: (message: string) => Promise<boolean>;
  report: (message: string) => void;
  pause?: TPause;
}

// The commit goes out before any approver picks its nonce, so the words can't be steered (PROTOCOL § 12).
export async function requestJoin(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  pin: Uint8Array,
  now: () => number,
  interaction: IJoinerInteraction,
): Promise<TJoiner> {
  const rejoinKey = await adapters.keychain.get(`envden/${adapters.home}/rejoin/device`);

  await withStateLock(adapters.home, () =>
    refuseCommittedJoin(
      adapters,
      !!rejoinKey && p.equal(readIdentity(rejoinKey).record.id, identity.record.id),
    ),
  );

  const nonce = p.randomBytes(32);
  const commit = p.joinCommit(pin, identity.record, nonce);

  const opened = p.JoinOpenedSchema.parse(
    await (await client.request("/v1/join-requests", "POST", { commit: text(commit) })).json(),
  );

  const expiresAt = requestDeadline(opened.expiresAt, now());
  interaction.report("On a device already in the vault, run: envden device approve");

  try {
    const path = `/v1/join-requests/${opened.number}/offer`;
    const pause = interaction.pause ?? pauseBriefly;
    const offerText = await waitMessage(client, path, now, expiresAt, pause);
    const offer = p.decode(p.JoinOfferCodec, binary(offerText));
    const reveal = p.encode(p.JoinRevealCodec, { device: identity.record, nonce });
    await putSlot(client, opened.number, "reveal", text(reveal));

    const words = p
      .joinWords({
        vaultId: offer.vaultId,
        pin,
        device: identity.record,
        joinerNonce: nonce,
        approverNonce: offer.nonce,
      })
      .join(" ");

    interaction.report(`Words: ${words}`);

    if (!(await interaction.confirm("Do they match the words on the approving device?")))
      throw new EnvdenError("INVALID_INPUT", "The words didn't match, so the join was cancelled");

    const joiner = {
      number: opened.number,
      vaultId: p.base32(offer.vaultId),
      pin: p.base32(pin),
      expiresAt,
    };

    await withStateLock(adapters.home, () => saveJoiner(adapters, joiner));

    return joiner;
  } catch (error) {
    await cancelRequest(client, opened.number);
    throw error;
  }
}

// The approval must commit within the request's window, which closes once it does.
async function waitApproved(client: TClient, joiner: TJoiner, now: () => number, pause: TPause) {
  for (;;) {
    const approved = await fetchApproved(client);
    if (approved) return approved;
    if (now() >= joiner.expiresAt || !(await requestOpen(client, joiner.number))) break;

    await pause();
  }

  const approved = await fetchApproved(client);
  if (approved) return approved;

  throw new EnvdenError(
    "UNAUTHORIZED",
    "The other device didn't approve this join. Run envden join again",
  );
}

async function requestOpen(client: TClient, number: number) {
  try {
    await client.request(`/v1/join-requests/${number}/offer`);

    return true;
  } catch (error) {
    if (error instanceof EnvdenError && error.code === "NOT_FOUND") return false;
    throw error;
  }
}

async function acceptApproval(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  joiner: TJoiner,
  message: string,
  rejoin: boolean,
) {
  const pin = p.unbase32(joiner.pin);
  const vaultId = p.unbase32(joiner.vaultId);
  const approved = p.decode(p.JoinApprovedCodec, binary(message));

  if (!p.equal(approved.serverPin, pin) || !p.equal(approved.vaultId, vaultId))
    throw new EnvdenError("UNAUTHORIZED", "The approval names another server or vault");

  const history = await readHistory(client, vaultId);
  if (rejoin) await adoptRejoin(adapters, history);

  await acceptJoin(adapters, client, identity, address, pin, history, approved.manifestHash);

  if (rejoin) await finishRejoinIdentity(adapters);
  await clearJoiner(adapters);
}

// Waiting doesn't hold the state lock, so other commands keep working meanwhile.
export async function finishJoin(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  joiner: TJoiner,
  options: { now: () => number; rejoin?: boolean; pause?: TPause },
) {
  const message = await waitApproved(client, joiner, options.now, options.pause ?? pauseBriefly);

  await withStateLock(adapters.home, async () => {
    try {
      await acceptApproval(adapters, client, identity, address, joiner, message, !!options.rejoin);
    } catch (error) {
      if (
        error instanceof EnvdenError &&
        ["INVALID_DATA", "FORK", "UNAUTHORIZED", "CONFLICT"].includes(error.code)
      )
        await clearJoiner(adapters);

      throw error;
    }
  });
}
