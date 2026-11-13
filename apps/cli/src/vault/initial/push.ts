import { withStateLock } from "../../state/lock.ts";
import { initialEntries } from "./entries.ts";
import { vaultConnection } from "../connection.ts";
import { retryHead } from "../../client/retry.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { text } from "../../client/encoding.ts";
import { readHistory } from "../history.ts";
import { saveState } from "../../state/repository.ts";

async function attemptPushInitialFiles(
  adapters: TAdapters,
  state: ILocalState,
  now: () => number,
): Promise<void> {
  if (!state.links.length) return;

  if (!state.server || !state.vaultId)
    throw new EnvdenError("NOT_FOUND", "Vault is not configured");

  const { identity, vaultId, client } = await vaultConnection(
    adapters,
    { ...state, server: state.server, vaultId: state.vaultId },
    now,
    fetch,
  );

  const history = await readHistory(client, vaultId);
  const previous = history.headers.at(-1)!;

  if (previous.body.seq !== 1n) return;

  const key = await adapters.keychain.get(`envden/${adapters.home}/epoch/1`);
  const idKey = await adapters.keychain.get(`envden/${adapters.home}/id-key`);
  if (!key || !idKey) throw new EnvdenError("LOCKED", "Vault keys unavailable");

  const files = await initialEntries(adapters, state, client, vaultId, key, idKey);

  if (!files.entries.length) return;
  files.entries.sort((a, b) => p.compare(a.fileId, b.fileId));
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, previous, "manifest");

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...previous.body,
      seq: 2n,
      prev: expectedHead,
      op: 1,
      filesHash: p.H("files", p.FilesCodec.write(files)),
      createdAt: BigInt(now()),
    },
    identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead,
    header,
    entries: [],
    files,
    keyring: undefined,
    envelope: undefined,
    opaqueRecord: undefined,
    skPub: undefined,
    approver: undefined,
  };

  await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
  state.headers.push(text(p.signedCodec(p.ManifestHeaderCodec).write(header)));
  state.files = text(p.FilesCodec.write(files));
  state.checkpoint = text(p.objectHash(p.ManifestHeaderCodec, header, "manifest"));
  await saveState(adapters.home, state);
}

export function pushInitialFiles(...args: Parameters<typeof attemptPushInitialFiles>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptPushInitialFiles(...args)));
}
