import { equal, ManifestHeaderCodec, objectHash } from "../../protocol/index.ts";
import type { IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import type { IDeviceListState } from "../devices/state.ts";
import { id } from "../shared/validation.ts";

export function classifyNonMember(input: {
  deviceId: Uint8Array;
  storedHeaders: readonly ISigned<IManifestHeader>[];
  verifiedHeaders: readonly ISigned<IManifestHeader>[];
  verifiedEntries: readonly ISigned<TEntry>[];
  state: IDeviceListState;
}):
  | { kind: "removed"; entry: ISigned<TEntry> }
  | { kind: "dropped-by-repair" | "rollback" | "fork" } {
  const { storedHeaders, verifiedHeaders, verifiedEntries, deviceId, state } = input;
  const checkpoint = storedHeaders.at(-1);
  const head = verifiedHeaders.at(-1);
  if (!checkpoint || !head) return { kind: "fork" };
  const hash = (h: ISigned<IManifestHeader>) => objectHash(ManifestHeaderCodec, h, "manifest");
  const stored = new Set(storedHeaders.map((h) => id(hash(h))));
  const descends = verifiedHeaders.some((h) => equal(hash(h), hash(checkpoint)));

  if (state.devices.has(id(deviceId)))
    return { kind: stored.has(id(hash(head))) ? "rollback" : "fork" };

  if (descends) {
    const removed = verifiedEntries.find(
      (e) =>
        e.body.seq > checkpoint.body.listSeq &&
        e.body.kind === 2 &&
        equal(e.body.payload.device, deviceId),
    );

    if (removed) return { kind: "removed", entry: removed };
  }

  const split = verifiedHeaders.find((h) => !stored.has(id(hash(h))));

  if (
    !descends &&
    split &&
    verifiedEntries.some(
      (e) =>
        e.body.seq >
          (verifiedHeaders.find((h) => equal(hash(h), split.body.prev))?.body.listSeq ?? 0n) &&
        e.body.kind === 6 &&
        stored.has(id(e.body.payload.restoredHead)),
    )
  ) {
    return { kind: "dropped-by-repair" };
  }

  return { kind: stored.has(id(hash(head))) ? "rollback" : "fork" };
}
