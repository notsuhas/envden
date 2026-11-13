import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { binary, text } from "../client/encoding.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";

export function recoveryJoins(values: string[], ownId?: Uint8Array) {
  const signed = values.map((value) => p.decode(p.signedCodec(p.EntryCodec), binary(value)));
  const entries = signed.map((entry) => entry.body);
  const notices: Record<string, string> = {};

  const ownJoin =
    entries.find(
      (entry) =>
        (entry.kind === 0 || entry.kind === 1) &&
        ownId !== undefined &&
        p.equal(entry.payload.device.id, ownId),
    )?.seq ?? -1n;

  let recovery: Uint8Array | undefined;

  for (const event of signed) {
    const entry = event.body;

    if (entry.kind === 1 && recovery && p.equal(entry.signer, recovery)) {
      if (entry.seq > ownJoin) {
        notices[text(p.objectHash(p.EntryCodec, event, "entry"))] = entry.payload.device.name;
      }
    }

    if (entry.kind === 0) recovery = entry.payload.recovery.id;
    else if (entry.kind === 4) recovery = entry.payload.recovery.id;
    else if (entry.kind === 2 && entry.payload.newRecovery) recovery = entry.payload.newRecovery.id;
  }

  return notices;
}

export async function printRecoveryJoins(home: string, notices: Record<string, string>) {
  const path = join(home, "state", "recovery-notice");
  const seen = new Set<string>(JSON.parse((await optionalRead(path)) ?? "[]"));

  for (const [id, name] of Object.entries(notices)) {
    if (seen.has(id)) continue;
    console.error(`envden: ${sanitizeTerminal(name)} joined with the recovery kit`);
    seen.add(id);
  }

  await atomicWrite(path, JSON.stringify([...seen]));
}

export async function reportRecoveryJoins(home: string, state: ILocalState, ownId?: Uint8Array) {
  await printRecoveryJoins(home, recoveryJoins(state.entries, ownId));
}
