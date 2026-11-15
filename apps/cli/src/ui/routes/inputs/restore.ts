import { z } from "zod";
import { fileInputSchema } from "./file.ts";

export const restoreInputSchema = fileInputSchema.extend({
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
