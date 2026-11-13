import { targets, assetName } from "../../../apps/cli/scripts/targets.ts";

export function validateVersion(version: string): string {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Expected a stable version such as 0.1.0, without the v prefix");
  }

  return version;
}

export function parseChecksums(contents: string): ReadonlyMap<string, string> {
  const expected = new Set(targets.map(assetName));
  const hashes = new Map<string, string>();

  for (const line of contents.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *](\S+)$/i.exec(line);
    const hash = match?.[1];
    const name = match?.[2];
    if (!hash || !name) throw new Error("Invalid SHA256SUMS entry");
    if (!expected.has(name)) throw new Error(`Unexpected release asset: ${name}`);
    if (hashes.has(name)) throw new Error(`Duplicate release asset: ${name}`);
    hashes.set(name, hash.toLowerCase());
  }

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
  const manifest: unknown = JSON.parse(template);

  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    typeof manifest.version !== "string" ||
    !("private" in manifest) ||
    manifest.private !== true
  ) {
    throw new Error("Expected a private npm package template with a version");
  }

  return `${JSON.stringify({ ...manifest, version: validateVersion(version) }, null, 2)}\n`;
}
