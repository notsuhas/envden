import { decodeHistoryEntries, decodeHistoryHeader } from "../client/history.ts";
import * as p from "@envden/core/protocol";
import { applyEntry } from "@envden/core/chain";
import type { IDeviceListState } from "@envden/core/chain";
import { EnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";
import { binary } from "../client/encoding.ts";

async function objects(client: TClient, path: string, from: bigint): Promise<string[]> {
  const result: string[] = [];

  while (true) {
    const value: unknown = await (await client.request(`${path}?from=${from}`)).json();
    const page = p.ObjectsResponseSchema.parse(value).objects;
    if (!page.length) return result;
    const last = binary(page.at(-1)!);

    const seq = p.u64.read(new p.Reader(last.subarray(34, 42)));

    if (seq < from) throw new EnvdenError("INVALID_DATA", "Invalid history page");
    result.push(...page);
    from = seq + 1n;
  }
}

export async function readHistory(
  client: TClient,
  vaultId: Uint8Array,
  local?: {
    entries: string[];
    headers: string[];
    latest?: string;
    verifiedState?: IDeviceListState;
  },
): Promise<THistory> {
  const entries = (local?.entries ?? []).map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), binary(value)),
  );

  const headers = (local?.headers ?? []).map((value) =>
    p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(value)),
  );

  const states = new Map<bigint, IDeviceListState>();
  const state = storedState(entries, anchoredState(entries, local?.verifiedState), states);

  const incoming = await objects(client, "/v1/entries", (entries.at(-1)?.body.seq ?? -1n) + 1n);

  const decoded = decodeHistoryEntries(
    incoming.map(binary),
    local?.entries.map(binary),
    local?.latest,
    state,
  );

  entries.push(...decoded.entries);
  for (const [seq, at] of decoded.states) states.set(seq, at);
  const finalState = decoded.state;
  const firstHeader = headers.length;

  const incomingHeaders = await objects(
    client,
    "/v1/headers",
    (headers.at(-1)?.body.seq ?? 0n) + 1n,
  );

  for (const value of incomingHeaders)
    headers.push(
      decodeHistoryHeader(
        binary(value),
        entries,
        local?.headers.map(binary),
        local?.latest,
        states,
      ),
    );

  if (!p.equal(finalState.vaultId, vaultId) || headers.length === 0)
    throw new EnvdenError("INVALID_DATA", "Invalid vault history");

  verifyNewHeaders(headers, firstHeader, states, vaultId);

  const final = headers.at(-1)!.body;

  if (final.listSeq !== finalState.seq || !p.equal(final.listHead, finalState.head))
    throw new EnvdenError("INVALID_DATA", "Uncommitted device list entries");

  return { entries, headers, state: finalState, states };
}

interface IHistory {
  entries: p.ISigned<p.TEntry>[];
  headers: p.ISigned<p.IManifestHeader>[];
  state: IDeviceListState;
  states?: ReadonlyMap<bigint, IDeviceListState>;
}

export type THistory = IHistory;

function storedState(
  entries: p.ISigned<p.TEntry>[],
  stored: IDeviceListState | undefined,
  states: Map<bigint, IDeviceListState>,
) {
  let state = stored;

  if (stored) states.set(stored.seq, stored);

  for (const entry of entries) {
    if (stored && entry.body.seq <= stored.seq) continue;
    const applied = applyEntry(state, entry);

    if (applied.kind !== "valid")
      throw new EnvdenError("INVALID_DATA", "Invalid stored device list");

    state = applied.state;
    states.set(state.seq, state);
  }

  return state;
}

function verifyNewHeaders(
  headers: p.ISigned<p.IManifestHeader>[],
  firstHeader: number,
  states: ReadonlyMap<bigint, IDeviceListState>,
  vaultId: Uint8Array,
) {
  let previous: Uint8Array = firstHeader
    ? p.objectHash(p.ManifestHeaderCodec, headers[firstHeader - 1]!, "manifest")
    : new Uint8Array(32);

  let previousEpoch = headers[firstHeader - 1]?.body.epoch ?? 0;

  for (let index = firstHeader; index < headers.length; index++) {
    const signed = headers[index]!;
    const h = signed.body;
    const at = states.get(h.listSeq);
    if (!at) throw new EnvdenError("INVALID_DATA", "Invalid device list");
    const signer = at.devices.get(p.base32(h.signer));

    if (!validHeader(signed, signer, vaultId, BigInt(index + 1), previous, at, previousEpoch))
      throw new EnvdenError("INVALID_DATA", "Invalid manifest history");

    previous = p.objectHash(p.ManifestHeaderCodec, signed, "manifest");
    previousEpoch = h.epoch;
  }
}

function validHeader(
  signed: p.ISigned<p.IManifestHeader>,
  signer: IDeviceListState["devices"] extends ReadonlyMap<string, infer V> ? V | undefined : never,
  vaultId: Uint8Array,
  seq: bigint,
  previous: Uint8Array,
  at: IDeviceListState,
  previousEpoch: number,
) {
  const h = signed.body;

  return !(
    !signer ||
    !p.equal(h.vaultId, vaultId) ||
    h.seq !== seq ||
    !p.equal(h.prev, previous) ||
    !p.equal(h.listHead, at.head) ||
    h.epoch !== at.epoch ||
    h.epoch < previousEpoch ||
    !p.verifyObject(p.ManifestHeaderCodec, signed, signer.objPub, "manifest").ok
  );
}

function anchoredState(entries: p.ISigned<p.TEntry>[], stored?: IDeviceListState) {
  if (!stored) return undefined;
  const anchor = entries.find((entry) => entry.body.seq === stored.seq);

  return anchor && p.equal(p.objectHash(p.EntryCodec, anchor, "entry"), stored.head)
    ? stored
    : undefined;
}
