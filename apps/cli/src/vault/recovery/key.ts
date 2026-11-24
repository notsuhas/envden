import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

import type { THistory } from "../history.ts";

export async function recoveryEpochKey(
  history: THistory,
  envelope: ReturnType<typeof p.openEnvelope>,
  recoveryKeys: { encSk: Uint8Array },
  vaultId: Uint8Array,
) {
  const recovery = history.state.recovery;

  if (
    !envelope.checkpoint.every((byte) => byte === 0) &&
    !history.headers.some((header) =>
      p.equal(p.objectHash(p.ManifestHeaderCodec, header, "manifest"), envelope.checkpoint),
    )
  )
    throw new EnvdenError("ROLLBACK", "Envelope checkpoint missing from history");

  const record = history.entries[0]!.body;
  if (record.kind !== 0) throw new EnvdenError("INVALID_DATA", "Missing genesis");
  let wrap: p.IWrap | undefined;

  for (const item of history.entries)
    if (item.body.kind === 2 || item.body.kind === 3 || item.body.kind === 4)
      wrap = item.body.payload.change.wraps.find((value) => p.equal(value.recipient, recovery.id));

  const commit = history.state.commits.get(history.state.epoch);
  if (!wrap || !commit) throw new EnvdenError("INVALID_DATA", "Missing recovery wrap");

  const epochKey = await p.openWrap(
    wrap,
    recoveryKeys.encSk,
    recovery.encPub,
    vaultId,
    history.state.epoch,
    commit,
  );

  return epochKey;
}
