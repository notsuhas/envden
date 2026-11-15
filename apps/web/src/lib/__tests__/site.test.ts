import { describe, expect, test } from "bun:test";
import { ENVDEN_VERSION } from "../site.ts";

describe("ENVDEN_VERSION", () => {
  test("keeps the getting-started output current", async () => {
    const docs = await Bun.file(
      new URL("../../../content/docs/getting-started/index.mdx", import.meta.url),
    ).text();

    expect(docs).toContain(`For v${ENVDEN_VERSION}, this prints:`);
    expect(docs).toContain(`\n${ENVDEN_VERSION}\n`);
  });

  test("follows the cli, server and npm release versions", async () => {
    for (const path of ["cli", "server"]) {
      const manifest = Bun.file(new URL(`../../../../${path}/package.json`, import.meta.url));

      expect((await manifest.json()).version).toBe(ENVDEN_VERSION);
    }

    const npm = Bun.file(new URL("../../../../../packaging/npm/package.json", import.meta.url));

    expect((await npm.json()).version).toBe(ENVDEN_VERSION);
  });
});
