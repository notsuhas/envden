import { EnvdenError } from "@envden/core/errors";
import type { TPlacementMode } from "@envden/core/adapters";
import { posix } from "node:path";
import { createHash } from "node:crypto";

export function temporaryName(path: string) {
  return `.envden-${createHash("sha256").update(path).digest("hex")}`;
}

export async function prepareTemporaryFile(
  mode: TPlacementMode,
  path: string,
  prepare?: (path: string) => Promise<void>,
) {
  if (mode !== "copy") return;

  if (!prepare)
    throw new EnvdenError("INVALID_INPUT", "Copy placement requires a temporary file exclude");

  await prepare(posix.join(posix.dirname(path), temporaryName(path)));
}
