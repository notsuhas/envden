import { deviceWrap } from "../keys/wrap.ts";
import { verifyChain } from "@envden/core/chain";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TDeviceIdentity } from "../../identity/device.ts";
import type { TClient } from "../../client/request.ts";
import type { THistory } from "../history.ts";
import { text, binary } from "../../client/encoding.ts";
import { emptyState } from "../../state/model.ts";
import { saveState, loadState } from "../../state/repository.ts";

export async function acceptJoin(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  address: string,
  pin: Uint8Array,
  history: THistory,
  manifestHash: Uint8Array,
) {
  const header = history.headers.find((item) =>
    p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), manifestHash),
  );

  if (
    !header ||
    !p.equal(history.state.serverPin, pin) ||
    !history.state.devices.has(p.base32(identity.record.id))
  )
    throw new EnvdenError("INVALID_DATA", "Pairing membership verification failed");

  const at = verifyChain(history.entries.filter((item) => item.body.seq <= header.body.listSeq));

  if (
    at.kind !== "valid" ||
    !p.equal(at.state.serverPin, pin) ||
    !at.state.devices.has(p.base32(identity.record.id))
  )
    throw new EnvdenError("INVALID_DATA", "Device was not added at the approved checkpoint");

  const existing = await loadState(adapters.home);

  if (
    existing?.checkpoint &&
    !history.headers.some((item) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, item, "manifest"), binary(existing.checkpoint!)),
    )
  )
    throw new EnvdenError("FORK", "Joined history does not descend from the local checkpoint");

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

  const box = new Uint8Array(
    await (await client.request(`/v1/keyrings/${text(header.body.keyringHash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H("keyring-blob", box), header.body.keyringHash))
    throw new EnvdenError("INVALID_DATA", "Invalid keyring hash");

  const ring = p.openKeyring(box, key, history.state.vaultId, header.body.epoch, at.state.commits);

  const files = new Uint8Array(
    await (await client.request(`/v1/files/${text(header.body.filesHash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H("files", files), header.body.filesHash))
    throw new EnvdenError("INVALID_DATA", "Invalid file list hash");

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
