import { rejects } from "node:assert/strict";
import { expect, test, spyOn } from "bun:test";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { setup } from "./fixture.ts";

import { place } from "../operations/place.ts";
import { remove } from "../operations/remove.ts";
import { safeParents } from "../paths/safe-parents.ts";

const fallback = { libc: undefined };

for (const mode of ["copy", "link"] as const)
  test(`fallback ${mode} creates private parents, replaces matching files and removes safely`, async () => {
    const { checkout, store } = await setup();
    const destination = join(checkout, "nested/.env");

    await place(
      mode,
      checkout,
      store,
      destination,
      undefined,
      fallback,
      async () => {},
      () => 1800000000000,
    );

    expect(await readFile(destination, "utf8")).toBe("A=secret\n");
    expect((await lstat(destination)).isSymbolicLink()).toBe(mode === "link");

    await place(
      mode,
      checkout,
      store,
      destination,
      undefined,
      fallback,
      async () => {},
      () => 1800000000000,
    );

    await remove(checkout, store, destination, fallback);
    expect(await readdir(join(checkout, "nested"))).toEqual([]);
    await remove(checkout, store, destination, fallback);

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
        () => 1800000000000,
      ),
      /Unsafe checkout parent/,
    );

    await rejects(remove(checkout, store, join(checkout, "unsafe/.env"), fallback));
    await unlink(join(checkout, "unsafe"));
  }

  await mkdir(destination);

  await rejects(
    place(
      "copy",
      checkout,
      store,
      destination,
      undefined,
      fallback,
      async () => {},
      () => 1800000000000,
    ),
    /Destination is not a file/,
  );

  await rejects(remove(checkout, store, destination, fallback), /Destination is not a file/);
  await rm(destination, { recursive: true });
  await symlink(store, destination);
  await rejects(remove(checkout, undefined, destination, fallback), /unrelated/);

  await rejects(
    place(
      "copy",
      checkout,
      alias,
      destination,
      undefined,
      fallback,
      async () => {},
      () => 1800000000000,
    ),
    /unrelated/,
  );

  await unlink(destination);

  for (const source of [alias, checkout])
    await rejects(
      place(
        "copy",
        checkout,
        source,
        destination,
        undefined,
        fallback,
        async () => {},
        () => 1800000000000,
      ),
      /Store source/,
    );

  await writeFile(destination, "keep");

  await rejects(
    place(
      "copy",
      checkout,
      store,
      destination,
      undefined,
      fallback,
      async () => {},
      () => 1800000000000,
    ),
    /Backup directory/,
  );

  expect(await readdir(checkout)).toEqual([".env"]);
  expect(await readFile(destination, "utf8")).toBe("keep");
});

import { backupContents } from "../backups/write.ts";

test("fallback backup writes private files and rejects checkout aliases", async () => {
  const { root, checkout } = await setup();
  const backups = join(root, "backups");
  const contents = Buffer.from("LOCAL=keep");

  backupContents(checkout, backups, contents, fallback, () => 1800000000000);
  const [name] = await readdir(backups);
  expect(await readFile(join(backups, name!))).toEqual(contents);
  expect((await stat(backups)).mode & 0o777).toBe(0o700);
  expect((await stat(join(backups, name!))).mode & 0o777).toBe(0o600);

  const alias = join(root, "backup-alias");
  await symlink(backups, alias);

  expect(() => backupContents(checkout, alias, contents, fallback, () => 1800000000000)).toThrow(
    "Unsafe backup directory",
  );

  await unlink(alias);
  await symlink(checkout, alias);

  expect(() => backupContents(checkout, alias, contents, undefined, () => 1800000000000)).toThrow(
    "outside checkout",
  );
});

import * as parents from "../paths/parent-identity.ts";

test("fallback preserves the original error and removes staged plaintext", async () => {
  const { checkout, store } = await setup();
  const original = new Error("original failure");

  const verify = spyOn(parents, "verifyParents")
    .mockRejectedValueOnce(original)
    .mockRejectedValue(new Error("cleanup failure"));

  try {
    await rejects(
      place(
        "copy",
        checkout,
        store,
        join(checkout, ".env"),
        undefined,
        fallback,
        async () => {},
        () => 1800000000000,
      ),
      (error) => error === original,
    );

    expect(await readdir(checkout)).toEqual([]);
  } finally {
    verify.mockRestore();
  }
});

// a link made through a symlinked ENVDEN_HOME is still ours once paths are resolved
for (const runtime of [fallback, undefined])
  test(`${runtime ? "fallback" : "native"} placement treats a link through a linked home as the store`, async () => {
    const { createFsPlacementAdapter } = await import("../index.ts");
    const { root, checkout, store } = await setup();
    await symlink(root, join(root, "home-link"));
    const destination = join(checkout, ".env");
    await symlink(join(root, "home-link", "store"), destination);
    const now = () => 1800000000000;
    const adapter = createFsPlacementAdapter("link", checkout, undefined, now);

    expect(await adapter.inspect(store, destination)).toBe("linked");
    await place("link", checkout, store, destination, undefined, runtime, async () => {}, now);
    expect(await readFile(destination, "utf8")).toBe("A=secret\n");
    await symlink(join(root, "home-link", "store"), join(checkout, ".env.old"));
    await remove(checkout, store, join(checkout, ".env.old"), runtime);
    await rejects(lstat(join(checkout, ".env.old")));
  });
