import { restrictAccess } from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";
import { open } from "node:fs/promises";

export async function writeKit(path: string, kit: unknown) {
  const file = await open(path, "wx", 0o600).catch((cause: unknown) => {
    throw new EnvdenError(
      "INVALID_INPUT",
      "Cannot create recovery kit; choose a new --kit-out path in an existing directory",
      { cause },
    );
  });

  try {
    await restrictAccess(path);
    await file.writeFile(JSON.stringify(kit, null, 2));
  } finally {
    await file.close();
  }
}
