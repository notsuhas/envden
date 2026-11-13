import { open } from "node:fs/promises";

export async function writeKit(path: string, kit: unknown) {
  const file = await open(path, "wx", 0o600);

  try {
    await file.writeFile(JSON.stringify(kit, null, 2));
  } finally {
    await file.close();
  }
}
