import * as p from "@envden/core/protocol";
import { join } from "node:path";
import type { ILocalState } from "../state/model.ts";
import { atomicWrite, optionalRead } from "../state/store/files.ts";
import { binary, text } from "../client/encoding.ts";
import { sanitizeTerminal } from "../output/sanitize.ts";

export function recoveryJoins(values: string[], ownId?: Uint8Array) {
  const signed = values.map((value) => p.decode(p.signedCodec(p.EntryCodec), binary(value)));
  const entries = signed.map((entry) => entry.body);
  const names = currentNames(entries);
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

    if (entry.kind === 1 && recovery && p.equal(entry.signer, recovery) && entry.seq > ownJoin)
      notices[text(p.objectHash(p.EntryCodec, event, "entry"))] = names.get(
        p.base32(entry.payload.device.id),
      )!;

    recovery = nextRecovery(recovery, entry);
  }

  return notices;
}

function currentNames(entries: p.TEntry[]) {
  const names = new Map<string, string>();

  for (const entry of entries) {
    if (entry.kind === 0 || entry.kind === 1)
      names.set(p.base32(entry.payload.device.id), entry.payload.device.name);
    else if (entry.kind === 7) names.set(p.base32(entry.payload.device), entry.payload.name);
  }

  return names;
}

function nextRecovery(current: Uint8Array | undefined, entry: p.TEntry) {
  if (entry.kind === 0 || entry.kind === 4) return entry.payload.recovery.id;
  if (entry.kind === 2 && entry.payload.newRecovery) return entry.payload.newRecovery.id;

  return current;
}

export async function printRecoveryJoins(
  home: string,
  notices: Record<string, string>,
  now: () => number,
) {
  const path = join(home, "state", "recovery-notice");
  const seen = new Set<string>(JSON.parse((await optionalRead(path)) ?? "[]"));

  for (const [id, name] of Object.entries(notices)) {
    if (seen.has(id)) continue;
    console.error(`envden: ${sanitizeTerminal(name)} joined with the recovery code`);
    seen.add(id);
  }

  await atomicWrite(path, JSON.stringify([...seen]), now);
}

export async function reportRecoveryJoins(
  home: string,
  state: ILocalState,
  ownId: Uint8Array | undefined,
  now: () => number,
) {
  await printRecoveryJoins(home, recoveryJoins(state.entries, ownId), now);
}
