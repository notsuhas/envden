import { describe, expect, test } from "bun:test";
import { ENVDEN_VERSION } from "../site.ts";

describe("ENVDEN_VERSION", () => {
  test("matches the CLI package version", async () => {
    const manifest = Bun.file(new URL("../../../../cli/package.json", import.meta.url));
    const { version } = (await manifest.json()) as { version: string };

    expect(ENVDEN_VERSION).toBe(version);
  });
});
