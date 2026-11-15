import { expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { restrictAccess, restrictAccessSync } from "../permissions.ts";

test("private keychain files and directories get POSIX modes or explicit non-inherited Windows ACLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-permissions-"));

  try {
    for (const directory of [false, true]) {
      const path = join(root, String(directory));

      if (directory) await mkdir(path);
      else await writeFile(path, "secret", { mode: 0o644 });

      await restrictAccess(path, directory);

      if (process.platform !== "win32")
        expect((await stat(path)).mode & 0o777).toBe(directory ? 0o700 : 0o600);

      await restrictAccess(path, directory, {
        platform: "win32",
        exec: async (command, args) => {
          expect([command, args]).toEqual([
            "icacls",
            [
              path,
              "/inheritance:r",
              "/grant:r",
              `${userInfo().username}:${directory ? "(OI)(CI)" : ""}F`,
            ],
          ]);

          return { stdout: "", stderr: "" };
        },
      });
    }

    const failure = new Error("ACL denied");

    await Promise.resolve(
      expect(
        restrictAccess(root, true, {
          platform: "win32",
          exec: async () => {
            throw failure;
          },
        }),
      ).rejects.toBe(failure),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the synchronous variant applies the same mode or Windows ACL", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-permissions-sync-"));

  try {
    const file = join(root, "file");
    await writeFile(file, "secret", { mode: 0o644 });
    restrictAccessSync(file);
    restrictAccessSync(root, true);

    if (process.platform !== "win32") {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect((await stat(root)).mode & 0o777).toBe(0o700);
    }

    const calls: [string, string[]][] = [];

    restrictAccessSync(root, true, {
      platform: "win32",
      exec: (command, args) => {
        calls.push([command, args]);

        return "";
      },
    });

    expect(calls).toEqual([
      ["icacls", [root, "/inheritance:r", "/grant:r", `${userInfo().username}:(OI)(CI)F`]],
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
