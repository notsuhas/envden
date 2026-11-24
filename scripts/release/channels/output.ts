import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseChecksums, renderTemplate, validateVersion } from "./render.ts";

export async function writeHomebrewFormula(args: string[]) {
  const [version, sums, output] = args;

  if (!version || !sums || !output)
    throw new Error(
      "Usage: bun scripts/release/homebrew-formula.ts <version> <SHA256SUMS> <output>",
    );

  const template = resolve(import.meta.dir, "../../../packaging/homebrew/envden.rb");
  const hashes = parseChecksums(await readFile(sums, "utf8"));

  const rendered = renderTemplate(
    await readFile(template, "utf8"),
    validateVersion(version),
    hashes,
  );

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rendered);
  console.log(`Formula for ${version} written to ${output}`);
}
