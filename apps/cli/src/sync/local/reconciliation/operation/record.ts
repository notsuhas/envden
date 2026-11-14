import * as p from "@envden/core/protocol";
import { binary } from "../../../../client/encoding.ts";
import { z } from "zod";
import { recoverSyncRecord } from "../../../../state/store/records.ts";

const operationSchema = z.object({
  targets: z.array(
    z.object({
      root: z.string(),
      path: z.string(),
      store: z.string(),
      mode: z.enum(["link", "copy"]),
    }),
  ),
  before: z.array(z.string().nullable()),
  written: z.array(z.boolean()),
  next: z.string().nullable(),
  server: z.string().nullable(),
  header: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  entry: z.string().nullable(),
});

export type TOperation = z.infer<typeof operationSchema>;

export async function readOperation(
  path: string,
  now = Date.now,
  report?: (message: string) => void,
) {
  return recoverSyncRecord(
    path,
    path.replace(/\.pending$/, ".corrupt"),
    decodeOperation,
    now(),
    report,
  );
}

export function decodeOperation(saved: string) {
  const operation = operationSchema.parse(JSON.parse(saved));
  if (operation.entry) p.decode(p.FileEntryCodec, binary(operation.entry));

  if (
    operation.before.length !== operation.targets.length + 1 ||
    operation.written.length !== operation.before.length
  )
    throw new Error("Invalid placement record");

  return operation;
}
