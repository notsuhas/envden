import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdir, chmod } from "node:fs/promises";

export function paths(home = process.env.ENVDEN_HOME ?? join(homedir(), ".envden")) {
  const root = resolve(home);

  return {
    home: root,
    store: join(root, "store"),
    state: join(root, "state"),
    base: join(root, "base"),
    conflicts: join(root, "conflicts"),
    config: join(root, "config.json"),
  };
}

export async function ensurePaths(home?: string) {
  const result = paths(home);

  for (const directory of [
    result.home,
    result.store,
    result.state,
    result.base,
    result.conflicts,
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }

  return result;
}
