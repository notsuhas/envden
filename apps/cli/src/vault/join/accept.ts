import { withStateLock } from "../../state/lock.ts";
import { deviceWrap } from "../keys/wrap.ts";
import { joinMembership, requireLocalFloor, verifiedBlob } from "./validation.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TDeviceIdentity } from "../../identity/device.ts";
import type { TClient } from "../../client/request.ts";
import type { THistory } from "../history.ts";
import { text } from "../../client/encoding.ts";
import { emptyState } from "../../state/model.ts";
import { saveState, loadState } from "../../state/repository.ts";

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

  const existing = await loadState(adapters.home);

  requireLocalFloor(history, existing?.checkpoint);

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

  const ring = p.openKeyring(box, key, history.state.vaultId, header.body.epoch, at.state.commits);

  const files = await verifiedBlob(client, "files", "files", header.body.filesHash);

  p.decode(p.FilesCodec, files);
  const state = existing ?? emptyState(identity.record.name);
  state.vaultId = p.base32(history.state.vaultId);
  state.server = { address, pin: text(pin), protocol: 1 };
  state.checkpoint = text(manifestHash);

  state.headers = history.headers.map((item) =>
    text(p.encode(p.signedCodec(p.ManifestHeaderCodec), item)),
  );

  state.entries = history.entries.map((item) => text(p.encode(p.signedCodec(p.EntryCodec), item)));
  state.keyring = text(box);
  state.files = text(files);
  await adapters.keychain.set(`envden/${adapters.home}/epoch/${header.body.epoch}`, key);
  await adapters.keychain.set(`envden/${adapters.home}/id-key`, ring.idKey);
  await saveState(adapters.home, state);

  return state;
}

export function acceptJoin(...args: Parameters<typeof lockedacceptJoin>) {
  return withStateLock(args[0].home, () => lockedacceptJoin(...args));
}
