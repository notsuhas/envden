import { z } from "zod";

export const renameInputSchema = z.strictObject({ name: z.string().min(1).max(256) });
