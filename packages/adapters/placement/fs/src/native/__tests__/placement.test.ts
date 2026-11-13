import { afterEach, expect, test } from "bun:test";
import { closeSync, renameSync, symlinkSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { libc, identity } from "../libc.ts";
import { openParent, writeAt } from "../directory.ts";
import { placeNative } from "../place.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "envden-native-"));
  roots.push(root);
  const checkout = join(root, "checkout");
  const outside = join(root, "outside");
  await mkdir(checkout);
  await mkdir(outside);
  const store = join(root, "store");
  await writeFile(store, "SECRET=1\n");

  return { root, checkout, outside, store };
}

test("native filesystem operations load on supported 64-bit POSIX platforms", () => {
  if (["darwin", "linux"].includes(process.platform) && ["arm64", "x64"].includes(process.arch))
    expect(libc).toBeDefined();
});

for (const mode of ["copy", "link"] as const)
  test.skipIf(!libc)(
    `${mode} rename stays on the opened directory after a parent swap`,
    async () => {
      const { checkout, outside, store } = await setup();
      const parent = join(checkout, "nested");

      placeNative(mode, checkout, "nested/.env", store, () => {
        renameSync(parent, join(checkout, "moved"));
        symlinkSync(outside, parent);
      });

      expect(await readdir(outside)).toEqual([]);
      expect(await readFile(join(checkout, "moved/.env"), "utf8")).toBe("SECRET=1\n");
    },
  );

test.skipIf(!libc)(
  "descriptor writes are exclusive and identity checks do not follow links",
  async () => {
    const { checkout, outside } = await setup();
    const fd = openParent(checkout, "nested/.env");

    try {
      expect(identity(fd, ".env")).toBeUndefined();
      writeAt(fd, ".env", Buffer.from("keep"));
      const before = identity(fd, ".env");
      expect(before).toBeDefined();
      expect(() => writeAt(fd, ".env", Buffer.from("replace"))).toThrow();
      expect(identity(fd, ".env")).toEqual(before);
      symlinkSync(outside, join(checkout, "link"));
      expect(() => openParent(checkout, "link/.env")).toThrow();
      symlinkSync(".env", join(checkout, "nested/alias"));
      expect(identity(fd, "alias")).not.toEqual(before);
      renameSync(join(checkout, "nested"), join(checkout, "moved"));
      symlinkSync(outside, join(checkout, "nested"));
      writeAt(fd, "after-swap", Buffer.from("safe"));
      expect(await readdir(outside)).toEqual([]);
      expect(await readFile(join(checkout, "moved/after-swap"), "utf8")).toBe("safe");
    } finally {
      closeSync(fd);
    }
  },
);
