import { z } from "zod";

export const resolveInputSchema = z.strictObject({
  id: z.string().min(1).max(4096),
  choice: z.enum(["keep-mine", "take-server"]),
});
