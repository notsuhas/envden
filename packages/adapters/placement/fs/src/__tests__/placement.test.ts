import { execFileSync } from "node:child_process";
import { rejects } from "node:assert/strict";
import { afterEach, expect, test } from "bun:test";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parentIdentity, verifyParents } from "../paths/parent-identity.ts";
import { createFsPlacementAdapter, storePathFor, validatePulledPath } from "../index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "envden-placement-"));
  roots.push(root);
  const checkout = join(root, "checkout");
  await mkdir(checkout);
  const store = join(root, "store");
  await writeFile(store, "A=secret\n");

  return { root, checkout, store };
}

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

test("copy placement preserves the replaced contents in a private backup", async () => {
  const { checkout, store } = await setup();
  const destination = join(checkout, ".env");
  await writeFile(destination, "LOCAL=keep\n");
  await createFsPlacementAdapter("copy", checkout).place(store, destination);
  const backup = (await readdir(checkout)).find((name) => name.includes(".envden-backup-"));
  expect(backup).toBeDefined();
  expect(await readFile(join(checkout, backup!), "utf8")).toBe("LOCAL=keep\n");
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
