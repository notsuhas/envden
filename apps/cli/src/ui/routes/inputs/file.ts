import { isAbsolute } from "node:path";
import { z } from "zod";

export const fileInputSchema = z.strictObject({
  root: z.string().min(1).max(4096).refine(isAbsolute),
  path: z.string().min(1).max(4096),
});
