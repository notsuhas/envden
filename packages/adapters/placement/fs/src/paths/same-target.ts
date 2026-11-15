import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// a link made through a symlinked ENVDEN_HOME or HOME still points at the store
export function sameTarget(target: string, storePath: string): boolean {
  if (resolve(target) === resolve(storePath)) return true;
  const real = realOrMissing(target);

  return real !== undefined && real === realOrMissing(storePath);
}

function realOrMissing(path: string) {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}
