import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { targets, assetName } from "../../../../apps/cli/scripts/targets.ts";
import { parseChecksums, renderTemplate, validateVersion } from "../render.ts";

const fixture = readFileSync(resolve(import.meta.dir, "SHA256SUMS"), "utf8");
const hashes = parseChecksums(fixture);
const packaging = resolve(import.meta.dir, "../../../../packaging");

describe("SHA256SUMS", () => {
  test("matches the CLI target count and asset names", () => {
    expect([...hashes.keys()]).toEqual(targets.map(assetName));
  });

  test.each([
    ["missing", fixture.split("\n").slice(1).join("\n"), "missing"],
    ["unknown", fixture.replace("envden-darwin-x64", "envden-other"), "envden-other"],
  ])("rejects %s", (_name, contents, message) => {
    expect(() => parseChecksums(contents!)).toThrow(message);
  });
});

describe("channel rendering", () => {
  test("renders the Homebrew formula", () => {
    const template = readFileSync(resolve(packaging, "homebrew/envden.rb"), "utf8");
    const output = renderTemplate(template, "1.2.3", hashes);

    expect(output).not.toContain("{{");
    expect(output).not.toContain("REPLACE_");
    expect(output).not.toContain("0.1.0");
    expect(output).toContain("1.2.3");
    expect(output).toContain("v#{version}");

    for (const platform of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"])
      expect(output).toContain(hashes.get(assetName(platform))!);
  });

  test("fails closed for missing hashes and unknown tokens", () => {
    expect(() => renderTemplate("{{VERSION}}", "1.2.3", new Map())).toThrow(
      "Missing or invalid hash",
    );

    expect(() => renderTemplate("{{UNKNOWN}}", "1.2.3", hashes)).toThrow("Unknown template token");
  });

  test.each(["../1.2.3", "1.2.3\n"])("rejects version %j", (version) => {
    expect(() => validateVersion(version)).toThrow("stable version");
  });
});
