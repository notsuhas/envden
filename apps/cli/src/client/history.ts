import * as p from "@envden/core/protocol";
import { applyEntry, decodeServerObject, verifyChain } from "@envden/core/chain";
import type { IDeviceListState } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import { VERSION } from "../version.ts";

function decodeHistoryObject<T>(
  received: Uint8Array,
  codec: p.ICodec<T>,
  label: "entry" | "manifest",
  state: IDeviceListState,
  stored: readonly Uint8Array[] = [],
  latestVersion = VERSION,
) {
  const result = decodeServerObject({
    received,
    codec,
    label,
    members:
      label === "entry" ? [...state.devices.values(), state.recovery] : [...state.devices.values()],
    stored: stored.find((raw) => p.equal(raw.subarray(34, 42), received.subarray(34, 42))),
    mismatch: "fork",
    currentVersion: VERSION,
    latestVersion,
  });

  if (result.kind === "known") return result.value;
  if (result.kind === "fork") throw new EnvdenError("FORK", "Server history forked");
  if (result.kind === "rollback") throw new EnvdenError("ROLLBACK", "Server history rolled back");

  if (result.kind === "update-required")
    throw new EnvdenError("UPDATE_REQUIRED", "Update envden to read server data");

  throw new EnvdenError(
    "INVALID_DATA",
    result.kind === "unreadable" ? "Unreadable data from server" : "Invalid data from server",
  );
}

export function decodeHistoryEntries(
  raw: readonly Uint8Array[],
  stored: readonly Uint8Array[] = [],
  latestVersion = VERSION,
  initial?: IDeviceListState,
) {
  const entries: p.ISigned<p.TEntry>[] = [];
  let state = initial;
  const states = new Map<bigint, IDeviceListState>();
  if (state) states.set(state.seq, state);

  for (const bytes of raw) {
    const entry = state
      ? decodeHistoryObject(bytes, p.EntryCodec, "entry", state, stored, latestVersion)
      : p.decode(p.signedCodec(p.EntryCodec), bytes);

    const result = applyEntry(state, entry);
    if (result.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid device list");
    state = result.state;
    states.set(state.seq, state);
    entries.push(entry);
  }

  if (!state) throw new EnvdenError("INVALID_DATA", "Missing device list");

  return { entries, state, states };
}

export function decodeHistoryHeader(
  raw: Uint8Array,
  entries: readonly p.ISigned<p.TEntry>[],
  stored: readonly Uint8Array[] = [],
  latestVersion = VERSION,
  states?: ReadonlyMap<bigint, IDeviceListState>,
) {
  const seq =
    raw[0] === 2 && raw[1] === 1
      ? p.u64.read(new p.Reader(raw.subarray(75, 83)))
      : (entries.at(-1)?.body.seq ?? 0n);

  const cached = states?.get(seq);

  const at = cached
    ? { kind: "valid" as const, state: cached }
    : verifyChain(entries.filter((entry) => entry.body.seq <= seq));

  if (at.kind !== "valid") throw new EnvdenError("INVALID_DATA", "Invalid device list");

  return decodeHistoryObject(
    raw,
    p.ManifestHeaderCodec,
    "manifest",
    at.state,
    stored,
    latestVersion,
  );
}
