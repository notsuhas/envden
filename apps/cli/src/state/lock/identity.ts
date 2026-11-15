import { z } from "zod";

const machineSchema = z.object({ host: z.string(), boot: z.string() });

export function machineIdentity(encoded: string) {
  try {
    return machineSchema.safeParse(JSON.parse(encoded)).data;
  } catch {
    return undefined;
  }
}
