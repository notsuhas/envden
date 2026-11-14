import type { IManifestHeader, ISigned } from "../../protocol/index.ts";

export function indexHeaders(headers: readonly ISigned<IManifestHeader>[]) {
  const bySeq = new Map<bigint, ISigned<IManifestHeader>>();

  for (const header of headers) if (!bySeq.has(header.body.seq)) bySeq.set(header.body.seq, header);

  return bySeq;
}
