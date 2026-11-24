import { join } from "node:path";
import { writeReleaseArchive } from "./archive.ts";
import { assetName, binaryName, targets } from "./targets.ts";

const root = join(import.meta.dir, "..");
const selected = process.argv.slice(2);

for (const platform of selected.length ? selected : targets) {
  if (!targets.includes(platform)) throw new Error(`Unsupported target: ${platform}`);

  await writeReleaseArchive(
    join(root, "dist", binaryName(platform)),
    join(root, "../../LICENSE"),
    join(root, "dist", assetName(platform)),
  );
}
