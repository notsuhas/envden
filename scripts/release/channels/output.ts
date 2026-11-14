import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseChecksums, renderTemplate, validateVersion } from "./render.ts";

const templates = {
  "homebrew-formula": "homebrew/envden.rb",
  "scoop-manifest": "scoop/envden.json",
};

export async function writeChannel(script: keyof typeof templates, args: string[]) {
  const [version, sums, output] = args;

  if (!version || !sums || !output)
    throw new Error(`Usage: bun scripts/release/${script}.ts <version> <SHA256SUMS> <output>`);

  const template = resolve(import.meta.dir, "../../../packaging", templates[script]);
  const hashes = parseChecksums(await readFile(sums, "utf8"));

  const rendered = renderTemplate(
    await readFile(template, "utf8"),
    validateVersion(version),
    hashes,
  );

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rendered);
  console.log(`Manifest for ${version} written to ${output}`);
}
