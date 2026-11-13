import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { targets, assetName } from "../../apps/cli/scripts/targets.ts";

const directory = process.argv[2] ?? "release";
const files = await readdir(directory);
const lines: string[] = [];

for (const platform of targets) {
  const name = assetName(platform);
  if (!files.includes(name)) throw new Error(`Missing build: ${name}`);
  const hash = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(join(directory, name)).arrayBuffer())
    .digest("hex");
  lines.push(`${hash}  ${name}`);
}

await Bun.write(join(directory, "SHA256SUMS"), `${lines.sort().join("\n")}\n`);
