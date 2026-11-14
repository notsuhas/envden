import { mkdtemp, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let config: Promise<string> | undefined;

export function emptyGlobalConfig() {
  config ??= createConfig().catch((error: unknown) => {
    config = undefined;
    throw error;
  });

  return config;
}

async function createConfig() {
  const directory = await mkdtemp(join(tmpdir(), "envden-git-config-"));

  process.once("exit", () => {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Windows may keep the config open until process teardown.
    }
  });

  const path = join(directory, "config");
  await writeFile(path, "", { flag: "wx", mode: 0o600 });

  return path;
}
