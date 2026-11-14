import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  parseChecksums,
  renderNpmPackage,
  renderTemplate,
  validateVersion,
} from "./channels/render.ts";

const template = resolve(import.meta.dir, "../../packaging/npm");
const [version, sums, output] = process.argv.slice(2);

if (!version || !sums || !output) {
  throw new Error("Usage: bun scripts/release/npm-package.ts <version> <SHA256SUMS> <output>");
}

const hashes = parseChecksums(await readFile(sums, "utf8"));

const manifest = JSON.parse(
  renderNpmPackage(
    await readFile(join(template, "package.json"), "utf8"),
    validateVersion(version),
  ),
);

delete manifest.private;

await mkdir(output, { recursive: true });

await cp(join(template, "bin"), join(output, "bin"), { recursive: true });

await cp(join(template, "install.js"), join(output, "install.js"));

await cp(join(template, "README.md"), join(output, "README.md"));

await writeFile(
  join(output, "checksums.json"),
  renderTemplate(await readFile(join(template, "checksums.json"), "utf8"), version, hashes),
);

await writeFile(join(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`npm package for ${version} written to ${output}`);
