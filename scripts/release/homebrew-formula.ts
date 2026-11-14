import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseChecksums, renderTemplate, validateVersion } from "./channels/render.ts";

const template = resolve(import.meta.dir, "../../packaging/homebrew/envden.rb");
const [version, sums, output] = process.argv.slice(2);

if (!version || !sums || !output) {
  throw new Error("Usage: bun scripts/release/homebrew-formula.ts <version> <SHA256SUMS> <output>");
}

const hashes = parseChecksums(await readFile(sums, "utf8"));

await mkdir(dirname(output), { recursive: true });

await writeFile(
  output,
  renderTemplate(await readFile(template, "utf8"), validateVersion(version), hashes),
);

console.log(`Homebrew formula for ${version} written to ${output}`);
