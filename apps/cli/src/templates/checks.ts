import { TEMPLATE_SUFFIXES } from "@envden/core/adapters";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ILocalState } from "../state/model.ts";
import { templateDrift, type ITemplateDrift } from "./compare.ts";

export interface ITemplateCheck extends ITemplateDrift {
  root: string;
  path: string;
  template: string;
}

export async function templateChecks(state: ILocalState): Promise<ITemplateCheck[]> {
  const checks: ITemplateCheck[] = [];

  for (const link of state.links) {
    const env = await optionalBytes(join(link.root, link.path));
    if (!env) continue;

    const template = await siblingTemplate(link.root, link.path);
    if (!template) continue;

    const drift = templateDrift(env, template.bytes);

    if (drift.missing.length || drift.extra.length)
      checks.push({ root: link.root, path: link.path, template: template.name, ...drift });
  }

  return checks;
}

async function siblingTemplate(root: string, path: string) {
  for (const suffix of TEMPLATE_SUFFIXES) {
    const name = `${basename(path)}.${suffix}`;
    const bytes = await optionalBytes(join(root, dirname(path), name));

    if (bytes) return { name, bytes };
  }

  return undefined;
}

// Only regular files, so a FIFO can't hang a refresh that holds the state lock.
async function optionalBytes(path: string) {
  const file = await stat(path).catch(() => undefined);
  if (!file?.isFile()) return undefined;

  return readFile(path).then(
    (buffer) => new Uint8Array(buffer),
    () => undefined,
  );
}
