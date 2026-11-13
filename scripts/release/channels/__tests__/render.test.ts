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
    expect(hashes.size).toBe(targets.length);

    const uppercase = fixture.replace(/^[a-f0-9]{64}/, "A".repeat(64));
    expect(parseChecksums(uppercase).get(assetName(targets[0]!))).toBe("a".repeat(64));
  });

  test.each([
    ["empty", "", "Invalid SHA256SUMS"],
    ["missing", fixture.split("\n").slice(1).join("\n"), "Expected 8 release hashes"],
    ["duplicate", fixture + fixture.split("\n")[0], "Duplicate release asset"],
    ["unknown", fixture.replace("envden-darwin-x64", "envden-other"), "Unexpected release asset"],
    ["extension", fixture.replace("windows-x64.exe", "windows-x64"), "Unexpected release asset"],
    ["invalid hash", fixture.replace(/^./, "g"), "Invalid SHA256SUMS"],
    ["short hash", fixture.slice(1), "Invalid SHA256SUMS"],
    ["extra", `${fixture}${"a".repeat(64)}  release.bin\n`, "Unexpected release asset"],
  ])("rejects %s", (_name, contents, message) => {
    expect(() => parseChecksums(contents!)).toThrow(message);
  });

  test("accepts CRLF and binary checksum markers", () => {
    expect(parseChecksums(fixture.replaceAll("  ", " *").replaceAll("\n", "\r\n"))).toEqual(hashes);
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

  test.each(["v1.2.3", "../1.2.3", "1.2", "01.2.3", "1.2.3-beta", "1.2.3\n"])(
    "rejects version %j",
    (version) => {
      expect(() => validateVersion(version)).toThrow("Expected a stable version");
    },
  );
});
