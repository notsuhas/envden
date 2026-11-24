import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "../files.ts";

test("without replace, a file that already exists survives and no temp file is left", async () => {
  const dir = await mkdtemp(join(tmpdir(), "envden-write-"));
  const path = join(dir, "out");

  await writeFile(path, "old");

  await Promise.resolve(
    expect(atomicWrite(path, "new", () => 0, false)).rejects.toMatchObject({ code: "EEXIST" }),
  );

  expect(await readFile(path, "utf8")).toBe("old");
  expect(await readdir(dir)).toEqual(["out"]);

  await atomicWrite(path, "new", () => 0);

  expect(await readFile(path, "utf8")).toBe("new");
});
