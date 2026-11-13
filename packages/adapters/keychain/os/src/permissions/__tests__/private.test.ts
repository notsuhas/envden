import { expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { restrictAccess } from "../private.ts";

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
