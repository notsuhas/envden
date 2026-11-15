import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishRelease } from "../publish.ts";

for (const [state, highest] of [
  ["new", true],
  ["draft", false],
  ["published", true],
  ["rebuilt", false],
] as const)
  test(`release ${state}, highest=${highest}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "envden-publish-"));

    const sums = await readFile(
      new URL("../../channels/__tests__/SHA256SUMS", import.meta.url),
      "utf8",
    );

    const calls: string[][] = [];

    try {
      await mkdir(join(directory, "release"));
      await writeFile(join(directory, "release/SHA256SUMS"), sums);

      const run = publishRelease({
        tag: "v1.2.3",
        repository: "test/envden",
        highest,
        macosSigned: false,
        directory,
        notes: "### Patch Changes\n\n- A fix.\n",
        gh: async (args) => {
          calls.push(args);

          if (args[0] === "api")
            return JSON.stringify([
              state === "new" ? [] : [{ tag_name: "v1.2.3", draft: state === "draft" }],
            ]);

          if (args[1] === "download")
            await writeFile(
              join(directory, "published/SHA256SUMS"),
              state === "rebuilt" ? sums.replace(/^[a-f0-9]{64}/, "f".repeat(64)) : sums,
            );

          return "";
        },
      });

      if (state === "rebuilt")
        await Promise.resolve(expect(run).rejects.toThrow("Re-run only failed jobs"));
      else await run;

      if (state === "new" || state === "draft") {
        expect(calls.some((args) => args[1] === "create")).toBe(state === "new");
        expect(calls.some((args) => args[1] === "upload")).toBe(true);

        expect(calls.at(-1)).toEqual([
          "release",
          "edit",
          "v1.2.3",
          "--draft=false",
          `--latest=${highest}`,
        ]);
      } else {
        expect(calls.some((args) => ["upload", "edit", "create"].includes(args[1] ?? ""))).toBe(
          false,
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
