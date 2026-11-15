import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { targets, assetName } from "../../../../apps/cli/scripts/targets.ts";
import { parseChecksums, renderNpmPackage, renderTemplate, validateVersion } from "../render.ts";

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
  test.each([
    ["homebrew/envden.rb", ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]],
    ["scoop/envden.json", ["windows-x64", "windows-arm64"]],
    ["winget/notsuhas.envden.installer.yaml", ["windows-x64", "windows-arm64"]],
    ["winget/notsuhas.envden.locale.en-US.yaml", []],
    ["winget/notsuhas.envden.yaml", []],
    ["npm/checksums.json", targets],
  ] satisfies [string, string[]][])("renders %s", (file, platforms) => {
    const template = readFileSync(resolve(packaging, file), "utf8");
    const output = renderTemplate(template, "1.2.3", hashes);
    expect(output).not.toContain("{{");
    expect(output).not.toContain("REPLACE_");
    expect(output).not.toContain("0.1.0");
    if (file !== "npm/checksums.json") expect(output).toContain("1.2.3");

    for (const platform of platforms) expect(output).toContain(hashes.get(assetName(platform))!);

    if (file === "homebrew/envden.rb") expect(output).toContain("v#{version}");

    if (file === "scoop/envden.json") {
      const manifest = JSON.parse(output);

      for (const [architecture, platform] of [
        ["64bit", "windows-x64"],
        ["arm64", "windows-arm64"],
      ]) {
        expect(manifest.architecture[architecture!].hash).toBe(hashes.get(assetName(platform!)));

        expect(manifest.architecture[architecture!].url).toEndWith(
          `/v1.2.3/${assetName(platform!)}`,
        );
      }
    }

    if (file === "npm/checksums.json") {
      expect(JSON.parse(output)).toEqual(
        Object.fromEntries(targets.map((target) => [target, hashes.get(assetName(target))])),
      );
    }
  });

  test("changes only the npm package version and preserves private", () => {
    const template = readFileSync(resolve(packaging, "npm/package.json"), "utf8");

    expect(JSON.parse(renderNpmPackage(template, "1.2.3"))).toEqual({
      ...JSON.parse(template),
      version: "1.2.3",
      private: true,
    });
  });

  test("fails closed for missing hashes and unknown tokens", () => {
    expect(() => renderTemplate("{{VERSION}}", "1.2.3", new Map())).toThrow(
      "Missing or invalid hash",
    );

    expect(() => renderTemplate("{{UNKNOWN}}", "1.2.3", hashes)).toThrow("Unknown template token");
    expect(() => renderNpmPackage('{"version":"0.1.0"}', "1.2.3")).toThrow("private npm package");
  });

  test.each(["../1.2.3", "1.2.3\n"])("rejects version %j", (version) => {
    expect(() => validateVersion(version)).toThrow("stable version");
  });
});
