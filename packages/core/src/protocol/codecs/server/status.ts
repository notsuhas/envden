import { z } from "zod";

const count = z.number().int().nonnegative();

export const StatusResponseSchema = z
  .object({
    version: z.string(),
    uptimeSeconds: count,
    mode: z.enum(["normal", "restored", "moved"]),
    vaults: count,
    storageBytes: count,
    fullestVault: z.enum(["below-50", "50-80", "80-95", "95-plus"]).nullable(),
    lastPrune: z.object({ at: z.iso.datetime(), ok: z.boolean() }).strict().nullable(),
  })
  .strict();

export type TStatusResponse = z.infer<typeof StatusResponseSchema>;

export type TServerMode = TStatusResponse["mode"];

export type TQuotaBand = NonNullable<TStatusResponse["fullestVault"]>;
