import { joinLocalState } from "./local-state.ts";
import { droppedRejoin } from "./floor.ts";
import { advanceCheckpoint } from "./advance.ts";
import { withStateLock } from "../../state/lock/lock.ts";
import { deviceWrap } from "../keys/wrap.ts";
import { adoptCommittedName } from "../../identity/rename.ts";
import { joinMembership, verifiedBlob } from "./validation.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TDeviceIdentity } from "../../identity/device.ts";
import type { TClient } from "../../client/request.ts";
import type { THistory } from "../history.ts";
import { text } from "../../client/encoding.ts";
import { emptyState } from "../../state/model.ts";
import type { loadState } from "../../state/store/repository.ts";
import { saveState } from "../../state/store/repository.ts";
import { recordUnlockWindow } from "../../session/window.ts";

async function lockedacceptJoin(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  history: THistory,
  manifestHash: Uint8Array,
) {
  const { header, at } = joinMembership(history, identity.record.id, pin, manifestHash);

  const existing = await joinLocalState(adapters.home, p.base32(history.state.vaultId));

  const dropped = await droppedRejoin(adapters, history, existing?.checkpoint);

  if (existing?.checkpoint && !dropped) {
    await recordUnlockWindow(client, existing);

    return advanceCheckpoint(adapters, client, identity, existing, history);
  }

  const wrap = deviceWrap(history.entries, identity.record.id, header.body.listSeq);

  const commit = at.state.commits.get(header.body.epoch);
  if (!wrap || !commit) throw new EnvdenError("INVALID_DATA", "Missing device epoch wrap");

  const key = await p.openWrap(
    wrap,
    identity.keys.encSk,
    identity.record.encPub,
    history.state.vaultId,
    header.body.epoch,
    commit,
  );

  const box = await verifiedBlob(client, "keyrings", "keyring-blob", header.body.keyringHash);

  const ring = p.openKeyring(
    box,
    key,
    history.state.vaultId,
    header.body.epoch,
    at.state.commits,
    await knownIdKey(adapters, existing),
  );

  const files = await verifiedBlob(client, "files", "files", header.body.filesHash);

  p.decode(p.FilesCodec, files);
  const committed = at.state.devices.get(p.base32(identity.record.id))!;
  await adoptCommittedName(adapters.keychain, adapters.home, committed);

  const state = existing ?? emptyState(committed.name);
  state.deviceName = committed.name;
  state.verifiedState = at.state;
  state.vaultId = p.base32(history.state.vaultId);
  state.server = { address, pin: text(pin), protocol: 1 };
  state.checkpoint = text(manifestHash);

  state.headers = history.headers
    .filter((item) => item.body.seq <= header.body.seq)
    .map((item) => text(p.encode(p.signedCodec(p.ManifestHeaderCodec), item)));

  state.entries = history.entries
    .filter((item) => item.body.seq <= header.body.listSeq)
    .map((item) => text(p.encode(p.signedCodec(p.EntryCodec), item)));

  state.keyring = text(box);
  state.files = text(files);
  await recordUnlockWindow(client, state);
  await adapters.keychain.set(`envden/${adapters.home}/epoch/${header.body.epoch}`, key);
  await adapters.keychain.set(`envden/${adapters.home}/id-key`, ring.idKey);
  await saveState(adapters.home, state, adapters.now);

  return state;
}

export function acceptJoin(...args: Parameters<typeof lockedacceptJoin>) {
  return withStateLock(args[0].home, () => lockedacceptJoin(...args));
}

async function knownIdKey(adapters: TAdapters, state: Awaited<ReturnType<typeof loadState>>) {
  if (!state) return undefined;

  return (await adapters.keychain.get(`envden/${adapters.home}/id-key`)) ?? undefined;
}
