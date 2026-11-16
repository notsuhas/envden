import { readFile } from "node:fs/promises";
import { z } from "zod";

const recoveryKit = z.object({ secretKey: z.string(), vaultId: z.string() });

export async function readKit(path: string) {
  const kit = recoveryKit.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!kit.success) throw new Error("Invalid recovery kit");

  return kit.data;
}
