import * as p from "@envden/core/protocol";
import type { THistory } from "../../vault/history.ts";

export function recoveryHolders(history: THistory): ReadonlySet<string> {
  const holders = new Set<string>();

  for (let index = 0; index < history.headers.length; index++) {
    const header = history.headers[index]!;
    const previous = history.headers[index - 1];

    if (!previous || !p.equal(previous.body.envelopeHash, header.body.envelopeHash))
      holders.add(p.base32(header.body.signer));
  }

  for (const signed of history.entries) {
    const entry = signed.body;

    if (
      entry.kind === 1 &&
      !history.entries.some((item) =>
        item.body.kind === 0
          ? p.equal(item.body.payload.device.id, entry.signer)
          : item.body.kind === 1 && p.equal(item.body.payload.device.id, entry.signer),
      )
    )
      holders.add(p.base32(entry.payload.device.id));
  }

  return holders;
}
