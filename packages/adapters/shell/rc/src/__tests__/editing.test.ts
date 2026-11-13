import { expect, test } from "bun:test";
import {
  link,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRcShellAdapter } from "../adapter.ts";
import { editRc } from "../files/edit.ts";

for (const operation of ["install", "uninstall"] as const) {
  test(`${operation} follows symlinked dotfiles and backs up original bytes privately`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-rc-"));

    try {
      const target = join(home, "dotfile");
      const backups = join(home, "conflicts");
      const adapter = createRcShellAdapter("bash", home, join(home, ".envden"), backups);

      const original =
        operation === "install" ? "# user\n" : `# user\n${adapter.hookSnippet("/opt/envden")}`;

      await writeFile(target, original);
      await symlink(target, adapter.rcPath());

      if (operation === "install") await adapter.install("/opt/envden");
      else await adapter.uninstall();

      expect(await adapter.installed()).toBe(operation === "install");
      expect(await readFile(target, "utf8")).toContain("# user\n");
      const names = await readdir(backups);
      expect(names).toHaveLength(1);
      const backup = join(backups, names[0]!);
      expect(await readFile(backup, "utf8")).toBe(original);
      if (process.platform !== "win32") expect((await stat(backup)).mode & 0o777).toBe(0o600);
      if (process.platform !== "win32") expect((await stat(backups)).mode & 0o777).toBe(0o700);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

for (const step of ["resolved", "opened", "read"] as const) {
  test(`rc swap after ${step} cannot copy private bytes into the checkout`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-rc-swap-"));

    try {
      const path = join(home, "rc");
      const target = join(home, "checkout");
      const privateFile = join(home, "private");
      const original = join(home, "original");
      await writeFile(target, "# user\n");
      await writeFile(privateFile, "PRIVATE BYTES");
      await symlink(target, path);

      const swap = async () => {
        await rename(target, original);
        await symlink(privateFile, target);
      };

      let result = "";

      const editing = editRc(
        path,
        (current) => {
          result = current;

          return current + "# edited\n";
        },
        undefined,
        { [step]: swap },
      );

      if (step === "resolved") expect(editing).rejects.toThrow();
      else await editing;

      expect(result).not.toContain("PRIVATE BYTES");
      expect(await readFile(privateFile, "utf8")).toBe("PRIVATE BYTES");
      await unlink(target);
      await writeFile(target, "checkout replacement");
      expect(await readFile(target, "utf8")).not.toContain("PRIVATE BYTES");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}

test("rc editing rejects hard links and non-files without changing their contents", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-rc-links-"));

  try {
    const original = join(home, "original");
    const path = join(home, "rc");
    await writeFile(original, "private");
    await link(original, path);
    expect(editRc(path, () => "replacement")).rejects.toThrow();
    expect(editRc(home, () => "replacement")).rejects.toThrow();
    expect(await readFile(original, "utf8")).toBe("private");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

for (const operation of ["install", "uninstall"] as const) {
  test(`${operation} never copies a privately resolved rc into a swapped checkout file`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-rc-disclosure-"));

    try {
      const path = join(home, "rc");
      const checkout = join(home, "checkout");
      const privateFile = join(home, "private");
      await writeFile(privateFile, "PRIVATE BYTES\n# hook\n");
      await symlink(privateFile, checkout);
      await symlink(checkout, path);

      await editRc(
        path,
        (current) =>
          operation === "install" ? current + "# installed\n" : current.replace("# hook\n", ""),
        undefined,
        {
          read: async () => {
            await unlink(checkout);
            await writeFile(checkout, "checkout replacement");
          },
        },
      );

      expect(await readFile(checkout, "utf8")).toBe("checkout replacement");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}
