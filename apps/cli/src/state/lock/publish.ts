import { link, open, rm } from "node:fs/promises";
import { join } from "node:path";
import type { IOwner } from "./owner.ts";

export async function publishOwner(path: string, value: IOwner) {
  const temporary = join(path, `.${value.token}.tmp`);
  const file = await open(temporary, "wx", 0o600);

  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }

  try {
    await link(temporary, join(path, "owner.json"));
  } finally {
    await rm(temporary, { force: true });
  }
}
