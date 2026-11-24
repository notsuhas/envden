import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyState } from "../../state/model.ts";
import { saveState } from "../../state/store/repository.ts";
import { exportBackup } from "../run.ts";

// Any valid X25519 recipient; these tests never decrypt.
const RECIPIENT = "age1zvkyg2lqzraa2lnjvqej32nkuu0ues2s82hzrye869xeexvn73equnujwj";

async function fixture() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "envden-export-")));
  const home = join(dir, "home");
  const store = join(home, "store", "x");

  await mkdir(store, { recursive: true });
  await writeFile(join(store, ".env"), "A=1\n");
  await mkdir(join(home, "store", "y"));
  await writeFile(join(home, "store", "y", ".env"), "B=2\n");
  await writeFile(join(store, ".0000000000000_00000000-0000-0000-0000-000000000000.tmp"), "A=");
  await mkdir(join(dir, "real", "deep"), { recursive: true });
  await symlink(join(dir, "real", "deep"), join(dir, "via"));

  await saveState(
    home,
    {
      ...emptyState("laptop"),
      approved: [{ root: "/code/api", gitDir: "/code/api/.git", repoId: "github.com/acme/api" }],
      links: [
        { root: "/code/api", path: ".env", store: join(store, ".env"), mode: "link" },
        { root: "/code/api", path: ".env.gone", store: join(store, ".env.gone"), mode: "link" },
      ],
    },
    () => 0,
  );

  const run = (out = "backup.age") =>
    exportBackup(
      { home, now: () => 0 },
      {
        out,
        cwd: dir,
        recipients: [RECIPIENT],
        passphrase: false,
        secret: async () => {
          throw new Error("no passphrase in recipient mode");
        },
      },
    );

  return { dir, home, run };
}

test("writes an age file readable only by the user and counts what it holds", async () => {
  const { dir, run } = await fixture();

  expect(await run()).toEqual({
    path: join(dir, "backup.age"),
    files: 2,
    missing: 1,
  });

  expect((await run("via/again.age")).path).toBe(join(dir, "real", "deep", "again.age"));
  expect((await run("via/../up.age")).path).toBe(join(dir, "real", "up.age"));

  const file = await readFile(join(dir, "backup.age"));

  expect(file.subarray(0, 21).toString()).toBe("age-encryption.org/v1");
  expect((await stat(join(dir, "backup.age"))).mode & 0o777).toBe(0o600);
});

test("an existing file, folder or link is never replaced, and a folder is never named", async () => {
  const { dir, run } = await fixture();

  await writeFile(join(dir, "backup.age"), "old");
  await mkdir(join(dir, "folder"));
  await symlink(join(dir, "nowhere"), join(dir, "dangling"));

  await Promise.resolve(expect(run("new.age/")).rejects.toMatchObject({ code: "INVALID_INPUT" }));

  for (const out of ["backup.age", "folder", "dangling"])
    await Promise.resolve(expect(run(out)).rejects.toMatchObject({ code: "CONFLICT" }));

  expect(await readFile(join(dir, "backup.age"), "utf8")).toBe("old");
});

test("unreadable state still exports every store file, under unplaced/", async () => {
  const { dir, home, run } = await fixture();

  await writeFile(join(home, "state", "device.json"), "{");

  expect(await run()).toEqual({ path: join(dir, "backup.age"), files: 2, missing: 0 });
});
