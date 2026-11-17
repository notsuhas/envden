import { orderJson } from "../../normalize/json.ts";
import * as p from "@envden/core/protocol";
import { hex } from "./encoding.ts";
import { applyEntry, type IDeviceListState } from "@envden/core/chain";

export interface IRetained {
  path: string;
  kind: "entry" | "manifest" | "files" | "blob" | "keyring" | "envelope" | "cache";
  bytes: Uint8Array;
  hash?: Uint8Array;
}

export function check(condition: unknown): asserts condition {
  if (!condition) throw new Error("Parity integrity validation failed");
}

export function validateObjects(objects: IRetained[]): Map<string, unknown> {
  const states = new Map<string, IDeviceListState>();
  const semantics = new Map<string, unknown>();

  verifyEntries(objects, states, semantics);

  for (const o of objects.filter((o) => o.kind !== "entry" && o.kind !== "cache")) {
    if (o.kind === "manifest") {
      semantics.set(o.path, verifyManifest(o, states));
    } else {
      const label = o.kind === "keyring" || o.kind === "envelope" ? `${o.kind}-blob` : o.kind;
      if (o.hash) check(p.equal(p.H(label, o.bytes), o.hash));
      if (o.kind === "files") semantics.set(o.path, p.decode(p.FilesCodec, o.bytes));
    }
  }

  validateCaches(objects, states);

  return semantics;
}

export function semanticJson(value: unknown): string {
  return JSON.stringify(value, (key, v: unknown) => {
    if (["name", "repoId", "path"].includes(key) && typeof v === "string")
      return [...new TextEncoder().encode(v)];

    if (v instanceof Uint8Array) return hex(v);

    if (isBufferJson(v)) return hex(Uint8Array.from(v.data));

    if (typeof v === "bigint") return v.toString();
    if (v instanceof Map) return [...v].sort(([a], [b]) => String(a).localeCompare(String(b)));
    if (v instanceof Set) return [...v].sort((a, b) => String(a).localeCompare(String(b)));

    return v;
  });
}

function revive(_key: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const tagged = value as {
    $bytes?: string;
    $bigint?: string;
    $map?: [unknown, unknown][];
    $set?: unknown[];
  };

  if (tagged.$bytes !== undefined) return Buffer.from(tagged.$bytes, "base64url");
  if (tagged.$bigint !== undefined) return BigInt(tagged.$bigint);
  if (tagged.$map) return new Map(tagged.$map);
  if (tagged.$set) return new Set(tagged.$set);

  return value;
}

function verifyEntries(
  objects: IRetained[],
  states: Map<string, IDeviceListState>,
  semantics: Map<string, unknown>,
): void {
  const entries = objects
    .filter((o) => o.kind === "entry")
    .map((o) => ({ o, signed: p.decode(p.signedCodec(p.EntryCodec), o.bytes) }));

  const pending = [...entries];

  while (pending.length) {
    const before = pending.length;

    for (let i = pending.length - 1; i >= 0; i--) {
      const { o, signed } = pending[i]!;
      const hash = p.objectHash(p.EntryCodec, signed, "entry");
      if (o.hash) check(p.equal(hash, o.hash));
      const previous = signed.body.seq === 0n ? undefined : states.get(hex(signed.body.parent));
      if (signed.body.seq !== 0n && !previous) continue;
      const result = applyEntry(previous, signed);
      check(result.kind === "valid");
      states.set(hex(hash), result.state);
      semantics.set(o.path, signed.body);
      pending.splice(i, 1);
    }

    check(pending.length < before);
  }
}

function verifyManifest(o: IRetained, states: Map<string, IDeviceListState>): p.IManifestHeader {
  const signed = p.decode(p.signedCodec(p.ManifestHeaderCodec), o.bytes);
  if (o.hash) check(p.equal(p.objectHash(p.ManifestHeaderCodec, signed, "manifest"), o.hash));
  const h = signed.body;
  const state = states.get(hex(h.listHead));
  check(state && p.equal(state.vaultId, h.vaultId) && state.seq === h.listSeq);
  const signer = state.devices.get(p.base32(h.signer));
  check(signer && p.verifyObject(p.ManifestHeaderCodec, signed, signer.objPub, "manifest").ok);

  return h;
}

function isBufferJson(value: unknown): value is { type: "Buffer"; data: number[] } {
  if (!value || typeof value !== "object") return false;
  const tagged = value as { type?: string; data?: unknown };

  return tagged.type === "Buffer" && Array.isArray(tagged.data);
}

function validateCaches(objects: IRetained[], states: Map<string, IDeviceListState>): void {
  for (const o of objects.filter((o) => o.kind === "cache")) {
    const cache = JSON.parse(Buffer.from(o.bytes).toString(), revive);

    if (cache.verifiedState) {
      const state = states.get(hex(cache.verifiedState.head));

      check(
        state &&
          JSON.stringify(orderJson(JSON.parse(semanticJson(state)))) ===
            JSON.stringify(orderJson(JSON.parse(semanticJson(cache.verifiedState)))),
      );
    }

    if (cache.checkpoint) {
      check(
        objects.some(
          (item) =>
            item.kind === "manifest" &&
            Buffer.from(
              p.objectHash(
                p.ManifestHeaderCodec,
                p.decode(p.signedCodec(p.ManifestHeaderCodec), item.bytes),
                "manifest",
              ),
            ).toString("base64url") === cache.checkpoint,
        ),
      );
    }
  }
}
