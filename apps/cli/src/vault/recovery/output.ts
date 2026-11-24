import { restrictAccess } from "@envden/core/process";
import { EnvdenError } from "@envden/core/errors";
import { open } from "node:fs/promises";

// Never overwrites: an earlier code in that file may be the only working one.
export async function writeRecoveryCode(path: string, code: string) {
  const file = await open(path, "wx", 0o600).catch((cause: unknown) => {
    throw new EnvdenError(
      "INVALID_INPUT",
      "Cannot create the recovery code file; choose a new --recovery-code-out path in an existing directory",
      { cause },
    );
  });

  try {
    await restrictAccess(path);
    await file.writeFile(`${code}\n`);
  } finally {
    await file.close();
  }
}
