import { execTrustedSync as execFileSync } from "@envden/core/process";
import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";

import { join } from "node:path";
import { parentIdentity, verifyParents } from "../paths/parent-identity.ts";
import {
  createFsPlacementAdapter,
  pruneBackups,
  storePathFor,
  validatePulledPath,
} from "../index.ts";

import { setup } from "./fixture.ts";

for (const path of [
  "../a",
  "/tmp/a",
  "a/../b",
  "C:/a",
  "C:\\a",
  "a\\b",
  "a//b",
  "a/./b",
  ".git/config",
  "a\0b",
  "CON",
  "file.",
])
  test(`reject ${JSON.stringify(path)}`, () => expect(() => validatePulledPath(path)).toThrow());

test("store layout", () =>
  expect(storePathFor("github.com/team/repo", "apps/web/.env", "/test/store")).toBe(
    join("/test/store", "github.com", "team", "repo", "apps", "web", ".env"),
  ));

for (const mode of ["link", "copy"] as const)
  test(`${mode} placement, replacement, permissions and inspection`, async () => {
    const { checkout, store } = await setup();
    const adapter = createFsPlacementAdapter(mode, checkout);
    const destination = join(checkout, "apps/.env");

    if (!(await adapter.supported(checkout))) {
      await rejects(adapter.place(store, destination));

      return;
    }

    expect(await adapter.inspect(store, destination)).toBe("missing");
    await adapter.place(store, destination);
    await adapter.place(store, destination);
    expect(await readFile(destination, "utf8")).toBe("A=secret\n");
    expect(await adapter.inspect(store, destination)).toBe("linked");

    await unlink(destination);
    await writeFile(destination, "A=secret\n");

    expect(await adapter.inspect(store, destination)).toBe(
      mode === "link" ? "relinkable" : "linked",
    );

    await writeFile(destination, "A=local\n");
    expect(await adapter.inspect(store, destination)).toBe("detached");
  });

test.skipIf(process.platform === "win32")(
  "reject escaping parent and destination symlinks without touching targets",
  async () => {
    const { root, checkout, store } = await setup();
    const adapter = createFsPlacementAdapter("copy", checkout);
    const outside = join(root, "outside");
    await mkdir(outside);
    await symlink(outside, join(checkout, "apps"));
    await rejects(adapter.place(store, join(checkout, "apps/.env")), /parent/);
    await symlink(store, join(checkout, ".env"));
    const unrelated = join(root, "unrelated");
    await writeFile(unrelated, "keep");
    await rejects(adapter.place(unrelated, join(checkout, ".env")), /unrelated/);
    expect(await readFile(store, "utf8")).toBe("A=secret\n");
    await rejects(adapter.place(store, join(checkout, "../escape")));
  },
);

for (const mode of ["copy", "link"] as const)
  test(`${mode} backups stay outside checkout, are private, and skip equal contents`, async () => {
    const { root, checkout, store } = await setup();
    const backups = join(root, "conflicts");
    const adapter = createFsPlacementAdapter(mode, checkout, backups);
    const destination = join(checkout, ".env");
    await writeFile(destination, "LOCAL=keep\n");
    await adapter.place(store, destination);
    await adapter.place(store, destination);
    await adapter.place(store, destination);
    const names = await readdir(backups);
    expect(names).toHaveLength(1);
    const backup = join(backups, names[0]!);
    expect(await readFile(backup, "utf8")).toBe("LOCAL=keep\n");
    expect(await readdir(checkout)).toEqual([".env"]);

    if (process.platform !== "win32") {
      expect((await lstat(backups)).mode & 0o777).toBe(0o700);
      expect((await lstat(backup)).mode & 0o777).toBe(0o600);
    }

    await unlink(destination);
    await writeFile(destination, "A=secret\n");
    await adapter.place(store, destination);
    expect(await readdir(backups)).toEqual(names);
  });

test("backup directory is required for differing content and cannot be in checkout", async () => {
  const { checkout, store } = await setup();
  const destination = join(checkout, ".env");
  await writeFile(destination, "keep");

  for (const backups of [undefined, join(checkout, "conflicts"), join(checkout, "..conflicts")])
    await rejects(createFsPlacementAdapter("copy", checkout, backups).place(store, destination));

  expect(await readFile(destination, "utf8")).toBe("keep");
  expect(await readdir(checkout)).toEqual([".env"]);
});

test("pruning uses caller time and keeps recent, unrelated and symlink entries", async () => {
  const { root } = await setup();
  const backups = join(root, "conflicts");
  await mkdir(backups);
  const old = ".envden-backup-11111111-1111-1111-1111-111111111111";
  const recent = ".envden-backup-22222222-2222-2222-2222-222222222222";
  for (const name of [old, recent, "keep"]) await writeFile(join(backups, name), "keep");
  await utimes(join(backups, old), 0, 0);
  await utimes(join(backups, recent), 4000000, 4000000);

  if (process.platform !== "win32") {
    const alias = ".envden-backup-33333333-3333-3333-3333-333333333333";
    await symlink(join(backups, old), join(backups, alias));
    await pruneBackups(backups, 4000000000);
    expect((await lstat(join(backups, alias))).isSymbolicLink()).toBe(true);
    await unlink(join(backups, alias));
  }

  await pruneBackups(backups, 4000000000);
  expect((await readdir(backups)).sort()).toEqual([recent, "keep"].sort());
  await pruneBackups(join(root, "missing"), 4000000000);
});

test("remove refuses unrelated links, unsafe parents and directories", async () => {
  const { root, checkout, store } = await setup();
  const adapter = createFsPlacementAdapter("copy", checkout);
  await adapter.remove(undefined, join(checkout, "missing/.env"));
  await mkdir(join(checkout, "folder"));
  await rejects(adapter.remove(undefined, join(checkout, "folder")));
  if (process.platform === "win32") return;
  await symlink(root, join(checkout, "escape"));
  await rejects(adapter.remove(store, join(checkout, "escape/store")));
  await symlink(store, join(checkout, ".env"));
  await rejects(adapter.remove(undefined, join(checkout, ".env")));
  expect(await readFile(store, "utf8")).toBe("A=secret\n");
  await adapter.remove(store, join(checkout, ".env"));
  await writeFile(join(checkout, ".env"), "local");
  await adapter.remove(undefined, join(checkout, ".env"));
});

test("parent identity rejects replacement directories even without symlinks", async () => {
  const { checkout } = await setup();
  const root = await realpath(checkout);
  const parent = join(root, "apps");
  await mkdir(parent);
  const destination = join(parent, ".env");
  const snapshot = await parentIdentity(root, destination);
  await rename(parent, join(root, "old"));
  await mkdir(parent);
  await rejects(verifyParents(snapshot, destination), /changed/);
});

test.skipIf(process.platform === "win32")("copy placement uses private POSIX modes", async () => {
  const { checkout, store } = await setup();
  const destination = join(checkout, "nested", ".env");
  await createFsPlacementAdapter("copy", checkout).place(store, destination);
  for (const file of [store, destination]) expect((await lstat(file)).mode & 0o777).toBe(0o600);
  expect((await lstat(join(checkout, "nested"))).mode & 0o777).toBe(0o700);
});

test.skipIf(process.platform !== "win32")(
  "copy placement restricts Windows file ACLs",
  async () => {
    const { checkout, store } = await setup();
    const destination = join(checkout, ".env");
    await createFsPlacementAdapter("copy", checkout).place(store, destination);

    for (const file of [store, destination]) {
      expect(execFileSync("icacls", [file], { encoding: "utf8" })).not.toContain("(I)");
    }
  },
);
