import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { adapterNames } from "./names.ts";
import { render } from "./render.ts";

const SUFFIX = ".tmpl";

async function templateFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) return [];

  return (await readdir(directory, { recursive: true })).filter((file) => file.endsWith(SUFFIX));
}

function kindExists(root: string, kind: string): boolean {
  return (
    existsSync(join(root, "packages/core/src/adapters", `${kind}.ts`)) &&
    existsSync(join(root, "packages/testing/src", kind, "contract.ts"))
  );
}

export async function generateAdapter(
  root: string,
  templates: string,
  kind: string,
  impl: string,
): Promise<string> {
  const names = adapterNames(kind, impl);
  const target = join(root, "packages/adapters", kind, impl);

  if (!kindExists(root, kind))
    throw new Error(`Add the ${kind} interface to core and its contract suite to testing first`);

  if (existsSync(target)) throw new Error(`${target} already exists`);

  for (const layer of [join(templates, "base"), join(templates, "kinds", kind)]) {
    for (const file of await templateFiles(layer)) {
      const path = join(target, file.slice(0, -SUFFIX.length));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, render(await readFile(join(layer, file), "utf8"), names));
    }
  }

  return target;
}
