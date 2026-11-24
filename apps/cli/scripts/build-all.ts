import { spawnTrusted } from "@envden/core/process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { targets, binaryName } from "./targets.ts";

const root = join(import.meta.dir, "..");
const selected = process.argv.slice(2);
const platforms = selected.length ? selected : targets;
const { packageManager } = await Bun.file(join(root, "../../package.json")).json();

// The embedded Bun runtime is most of the binary and grows between releases, so builds use the pinned one.
if (packageManager !== `bun@${Bun.version}`)
  throw new Error(`Release builds need ${packageManager}, not bun@${Bun.version}`);

await mkdir(join(root, "dist"), { recursive: true });

for (const platform of platforms) {
  if (!targets.includes(platform)) throw new Error(`Unsupported target: ${platform}`);
  const child = spawnTrusted(
    "bun",
    [
      "build",
      "--compile",
      "--define",
      `__ENVDEN_TELEMETRY_KEY__=${JSON.stringify(process.env.ENVDEN_TELEMETRY_KEY ?? "")}`,
      "--no-compile-autoload-dotenv",
      "--no-compile-autoload-bunfig",
      `--target=bun-${platform}`,
      join(root, "src/main.ts"),
      "--outfile",
      join(root, "dist", binaryName(platform)),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await child.exited) !== 0) throw new Error(`Build failed: ${platform}`);
}
