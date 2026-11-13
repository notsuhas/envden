import { deviceWrap } from "../../vault/keys/wrap.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { text } from "../../client/encoding.ts";
import type { THistory } from "../../vault/history.ts";
import type { TAdminContext } from "./context.ts";

export async function currentMaterial(context: TAdminContext, history: THistory) {
  const head = history.headers.at(-1)!;
  const wrap = deviceWrap(history.entries, context.identity.record.id);

  const commit = history.state.commits.get(head.body.epoch);
  if (!wrap || !commit) throw new EnvdenError("UNAUTHORIZED", "Device is no longer a member");

  const key = await p.openWrap(
    wrap,
    context.identity.keys.encSk,
    context.identity.record.encPub,
    context.vaultId,
    head.body.epoch,
    commit,
  );

  const box = new Uint8Array(
    await (
      await context.client.request(`/v1/keyrings/${text(head.body.keyringHash)}`)
    ).arrayBuffer(),
  );

  if (!p.equal(p.H("keyring-blob", box), head.body.keyringHash))
    throw new EnvdenError("INVALID_DATA", "Keyring hash mismatch");

  const knownId = await context.adapters.keychain.get(`envden/${context.adapters.home}/id-key`);

  const ring = p.openKeyring(
    box,
    key,
    context.vaultId,
    head.body.epoch,
    history.state.commits,
    knownId ?? undefined,
  );

  const keys = new Map([
    ...ring.older.map((item) => [item.epoch, item.key] as const),
    [ring.epoch, key] as const,
  ]);

  return { key, ring, keys };
}
