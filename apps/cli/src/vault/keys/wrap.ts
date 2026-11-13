import * as p from "@envden/core/protocol";

export function deviceWrap(
  entries: p.ISigned<p.TEntry>[],
  recipient: Uint8Array,
  through?: bigint,
) {
  let wrap: p.IWrap | undefined;

  for (const { body: entry } of entries) {
    if (through !== undefined && entry.seq > through) break;
    if (entry.kind === 1 && p.equal(entry.payload.device.id, recipient)) wrap = entry.payload.wrap;

    if (entry.kind === 2 || entry.kind === 3 || entry.kind === 4)
      wrap = entry.payload.change.wraps.find((item) => p.equal(item.recipient, recipient));
  }

  return wrap;
}
