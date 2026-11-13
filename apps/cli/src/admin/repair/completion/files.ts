import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { readHistory } from "../../../vault/history.ts";
import { text } from "../../../client/encoding.ts";
import type { repairContext } from "../upload.ts";

export async function repairFiles(
  context: Awaited<ReturnType<typeof repairContext>>,
  history: Awaited<ReturnType<typeof readHistory>>,
) {
  const head = history.headers.at(-1)!;

  const fileBytes = new Uint8Array(
    await (await context.client.request(`/v1/files/${text(head.body.filesHash)}`)).arrayBuffer(),
  );

  if (!p.equal(p.H("files", fileBytes), head.body.filesHash))
    throw new EnvdenError("INVALID_DATA", "Repair file list hash mismatch");

  const files = p.decode(p.FilesCodec, fileBytes);

  return files;
}
