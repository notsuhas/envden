import * as p from "@envden/core/protocol";
import { verifyChain } from "@envden/core/chain";

export function localRepairChain(encoded: string[]) {
  const entries = encoded.map((value) =>
    p.decode(p.signedCodec(p.EntryCodec), new Uint8Array(Buffer.from(value, "base64url"))),
  );

  return { entries, chain: verifyChain(entries) };
}
