import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { kitFolder } from "../folder.ts";

const layouts = {
  folder: (home: string) => mkdir(join(home, "Downloads")),
  symlink: async (home: string) => {
    await mkdir(join(home, "elsewhere"));
    await symlink(join(home, "elsewhere"), join(home, "Downloads"));
  },
  file: (home: string) => writeFile(join(home, "Downloads"), ""),
  missing: async () => {},
};

test.each([
  ["folder", "Downloads"],
  ["symlink", "Downloads"],
  ["file", ""],
  ["missing", ""],
] as const)("Downloads as a %s puts the kit in %p", async (layout, folder) => {
  const home = await mkdtemp(join(tmpdir(), "envden-kit-folder-"));

  try {
    await layouts[layout](home);

    expect(await kitFolder(home)).toBe(join(home, folder));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
