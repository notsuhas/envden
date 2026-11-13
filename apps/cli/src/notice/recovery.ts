import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { binary } from "../client/encoding.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";

export async function reportRecoveryJoins(home: string, state: ILocalState, ownId?: Uint8Array) {
  const path = join(home, "state", "recovery-notice");
  const seen = new Set(JSON.parse((await optionalRead(path)) ?? "[]") as string[]);

  const entries = state.entries.map(
    (value) => p.decode(p.signedCodec(p.EntryCodec), binary(value)).body,
  );

  const ownJoin =
    entries.find(
      (entry) =>
        (entry.kind === 0 || entry.kind === 1) &&
        ownId !== undefined &&
        p.equal(entry.payload.device.id, ownId),
    )?.seq ?? -1n;

  let recovery: Uint8Array | undefined;

  for (const entry of entries) {
    if (entry.kind === 1 && recovery && p.equal(entry.signer, recovery)) {
      const id = entry.seq.toString();

      if (!seen.has(id) && entry.seq > ownJoin)
        console.error(
          `envden: ${sanitizeTerminal(entry.payload.device.name)} joined with the recovery kit`,
        );

      seen.add(id);
    }

    if (entry.kind === 0) recovery = entry.payload.recovery.id;
    else if (entry.kind === 4) recovery = entry.payload.recovery.id;
    else if (entry.kind === 2 && entry.payload.newRecovery) recovery = entry.payload.newRecovery.id;
  }

  await atomicWrite(path, JSON.stringify([...seen]));
}
