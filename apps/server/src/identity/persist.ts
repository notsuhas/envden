import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export async function persistIdentity(dataDir: string, data: string, io = fs): Promise<void> {
  const temporary = join(dataDir, `.identity-${randomUUID()}`);
  const file = await io.open(temporary, "wx", 0o600);

  try {
    await file.writeFile(data);
    await file.sync();
  } finally {
    await file.close();
  }

  try {
    await io.link(temporary, join(dataDir, "identity.json"));
    const directory = await io.open(dataDir, "r");

    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await io.rm(temporary, { force: true });
  }
}
