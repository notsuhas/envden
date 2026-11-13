import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { targets, assetName } from "./targets.ts";

const root = join(import.meta.dir, "..");
const selected = process.argv.slice(2);
const platforms = selected.length ? selected : targets;

await mkdir(join(root, "dist"), { recursive: true });

for (const platform of platforms) {
  if (!targets.includes(platform)) throw new Error(`Unsupported target: ${platform}`);
  const child = Bun.spawn(
    [
      "bun",
      "build",
      "--compile",
      "--no-compile-autoload-dotenv",
      "--no-compile-autoload-bunfig",
      `--target=bun-${platform}`,
      join(root, "src/main.ts"),
      "--outfile",
      join(root, "dist", assetName(platform)),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await child.exited) !== 0) throw new Error(`Build failed: ${platform}`);
}
