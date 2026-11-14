import { z } from "zod";

const targetSchema = z
  .object({
    root: z.string(),
    path: z.string(),
    store: z.string(),
    mode: z.enum(["copy", "link"]),
    localOnly: z.literal(true).optional(),
  })
  .transform(({ localOnly, ...target }) => (localOnly ? { ...target, localOnly } : target));

export const conflictDocumentSchema = z.object({
  model: z.literal("shared-store"),
  records: z.array(
    z.object({
      remote: z.string(),
      alternatives: z.array(z.string()),
      targets: z.array(targetSchema),
      entry: z.string().nullable(),
      store: z.string(),
      root: z.string(),
      path: z.string(),
      mode: z.enum(["copy", "link"]),
      base: z.string(),
      file: z.string(),
      server: z.string(),
      mine: z.string(),
      deleted: z.boolean(),
      mineDeleted: z.boolean(),
    }),
  ),
});
