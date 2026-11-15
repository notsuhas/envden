import { z } from "zod";
import { isSemver } from "@envden/core/protocol";
import { parseSha256Sums } from "@envden/core/release";
import { targets, assetName } from "../../../apps/cli/scripts/targets.ts";

const npmTemplateSchema = z.looseObject({ version: z.string(), private: z.literal(true) });

export function validateVersion(version: string): string {
  if (!isSemver(version)) {
    throw new Error("Expected a stable version such as 0.1.0, without the v prefix");
  }

  return version;
}

export function parseChecksums(contents: string): ReadonlyMap<string, string> {
  const expected = new Set(targets.map(assetName));
  const hashes = parseSha256Sums(contents);
  const unexpected = [...hashes.keys()].find((name) => !expected.has(name));

  if (unexpected) throw new Error(`Unexpected release asset: ${unexpected}`);

  const missing = [...expected].filter((name) => !hashes.has(name));

  if (missing.length) {
    throw new Error(`Expected ${expected.size} release hashes; missing: ${missing.join(", ")}`);
  }

  return hashes;
}

export function renderTemplate(
  template: string,
  version: string,
  hashes: ReadonlyMap<string, string>,
): string {
  const tokens = new Map([["VERSION", validateVersion(version)]]);

  for (const target of targets) {
    const hash = hashes.get(assetName(target));

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      throw new Error(`Missing or invalid hash: ${assetName(target)}`);
    }

    tokens.set(`SHA256_${target.toUpperCase().replaceAll("-", "_")}`, hash.toLowerCase());
  }

  return template.replace(/\{\{([^{}]+)\}\}/g, (_, token: string) => {
    const value = tokens.get(token);
    if (value === undefined) throw new Error(`Unknown template token: ${token}`);

    return value;
  });
}

export function renderNpmPackage(template: string, version: string): string {
  const manifest = npmTemplateSchema.safeParse(JSON.parse(template));
  if (!manifest.success) throw new Error("Expected a private npm package template with a version");

  return `${JSON.stringify({ ...manifest.data, version: validateVersion(version) }, null, 2)}\n`;
}
