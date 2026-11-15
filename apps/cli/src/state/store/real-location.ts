import { realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

// ENVDEN_HOME may link elsewhere or not exist yet; resolve what exists so owned-path checks agree
export function realLocation(path: string): string {
  const absolute = resolve(path);

  try {
    return realpathSync(absolute);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
    const parent = dirname(absolute);

    return parent === absolute ? absolute : join(realLocation(parent), basename(absolute));
  }
}
