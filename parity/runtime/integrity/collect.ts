import { retained } from "./scan.ts";
import { validateObjects } from "./objects.ts";
import { decrypted } from "./decrypt.ts";

export async function verifyRetained(root: string): Promise<Map<string, unknown>> {
  try {
    const objects = await retained(root);
    const verified = validateObjects(objects);
    await decrypted(root, objects, verified);

    return verified;
  } catch {
    throw new Error("Parity integrity validation failed");
  }
}
