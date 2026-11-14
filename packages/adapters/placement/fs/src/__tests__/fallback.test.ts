import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { lstat, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { setup } from "./fixture.ts";

import { place } from "../operations/place.ts";
import { remove } from "../operations/remove.ts";
import { safeParents } from "../paths/safe-parents.ts";

const fallback = { platform: "win32" as const, libc: undefined };

for (const mode of ["copy", "link"] as const)
  test(`fallback ${mode} creates private parents, replaces matching files and removes safely`, async () => {
    const { checkout, store } = await setup();
    const destination = join(checkout, "nested/.env");
    await place(mode, checkout, store, destination, undefined, fallback, async () => {});
    expect(await readFile(destination, "utf8")).toBe("A=secret\n");
    expect((await lstat(destination)).isSymbolicLink()).toBe(mode === "link");
    await place(mode, checkout, store, destination, undefined, fallback, async () => {});
    await remove(checkout, store, destination, fallback);
    expect(await readdir(join(checkout, "nested"))).toEqual([]);
    await remove(checkout, store, destination, fallback);

    if (process.platform !== "win32")
      expect((await lstat(join(checkout, "nested"))).mode & 0o777).toBe(0o700);
  });

test("fallback refuses unsafe roots, parents, sources and destinations without changing contents", async () => {
  const { root, checkout, store } = await setup();
  const destination = join(checkout, ".env");
  const alias = join(root, "alias");
  await symlink(checkout, alias);
  await rejects(safeParents(alias, "nested/.env"), /Unsafe checkout root/);
  await rejects(safeParents(store, ".env"), /Unsafe checkout root/);

  for (const parent of [store, root]) {
    await symlink(parent, join(checkout, "unsafe"));

    await rejects(
      place(
        "copy",
        checkout,
        store,
        join(checkout, "unsafe/.env"),
        undefined,
        fallback,
        async () => {},
      ),
      /Unsafe checkout parent/,
    );

    await rejects(remove(checkout, store, join(checkout, "unsafe/.env"), fallback));
    await unlink(join(checkout, "unsafe"));
  }

  await mkdir(destination);

  await rejects(
    place("copy", checkout, store, destination, undefined, fallback, async () => {}),
    /Destination is not a file/,
  );

  await rejects(remove(checkout, store, destination, fallback), /Destination is not a file/);
  await rm(destination, { recursive: true });
  await symlink(store, destination);
  await rejects(remove(checkout, undefined, destination, fallback), /unrelated/);

  await rejects(
    place("copy", checkout, alias, destination, undefined, fallback, async () => {}),
    /unrelated/,
  );

  await unlink(destination);

  for (const source of [alias, checkout])
    await rejects(
      place("copy", checkout, source, destination, undefined, fallback, async () => {}),
      /Store source/,
    );

  await writeFile(destination, "keep");

  await rejects(
    place("copy", checkout, store, destination, undefined, fallback, async () => {}),
    /Backup directory/,
  );

  expect(await readdir(checkout)).toEqual([".env"]);
  expect(await readFile(destination, "utf8")).toBe("keep");

  await rejects(
    place(
      "copy",
      checkout,
      store,
      destination,
      undefined,
      { ...fallback, platform: "darwin" },
      async () => {},
    ),
    /Backup directory/,
  );
});

import { backupContents } from "../backups/write.ts";

test("fallback backup requires private ACLs before writing and rejects checkout aliases", async () => {
  const { root, checkout } = await setup();
  const backups = join(root, "backups");
  const contents = Buffer.from("LOCAL=keep");

  for (const status of [1, 0]) {
    const spawn = (args: string[]) => {
      expect(args).toEqual([
        backups,
        "/inheritance:r",
        "/grant:r",
        `${userInfo().username}:(OI)(CI)F`,
      ]);

      return status;
    };

    const write = () => backupContents(checkout, backups, contents, { libc: undefined, spawn });

    if (status) {
      expect(write).toThrow("restrict backup access");
      expect(await readdir(backups)).toEqual([]);
    } else {
      write();
      expect(await readFile(join(backups, (await readdir(backups))[0]!))).toEqual(contents);
    }
  }

  const alias = join(root, "backup-alias");
  await symlink(backups, alias);

  expect(() =>
    backupContents(checkout, alias, contents, {
      libc: undefined,
      spawn: () => {
        throw new Error("unsafe backup reached ACL restriction");
      },
    }),
  ).toThrow("Unsafe backup directory");

  await unlink(alias);
  await symlink(checkout, alias);
  expect(() => backupContents(checkout, alias, contents)).toThrow("outside checkout");
});
