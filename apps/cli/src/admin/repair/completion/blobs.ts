import { optionalObject } from "../../shared/transfer.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { binary } from "../../../client/encoding.ts";
import type { repairContext } from "../upload.ts";

export async function availableBlobs(context: Awaited<ReturnType<typeof repairContext>>) {
  const hashes = p.ObjectsResponseSchema.parse(
    await (await context.client.request("/v1/blobs")).json(),
  ).objects;

  const available = new Set<string>();

  for (const hash of hashes) {
    const blob = await optionalObject(context.client, `/v1/blobs/${hash}`);
    if (!blob) continue;

    if (!p.equal(p.H("blob", blob), binary(hash)))
      throw new EnvdenError("INVALID_DATA", "Repair blob hash mismatch");

    available.add(p.base32(binary(hash)));
  }

  return available;
}
