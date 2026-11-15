import { expect, test } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createRcShellAdapter } from "../adapter.ts";

for (const shell of ["zsh", "bash", "fish", "powershell"] as const)
  for (const operation of ["install", "uninstall"] as const)
    test(`${shell} ${operation} edits a dotfiles target, keeps the link and backs up privately`, async () => {
      const home = await mkdtemp(join(tmpdir(), "envden-rc-"));

      try {
        const target = join(home, "dotfile");
        const backups = join(home, "conflicts");
        const adapter = createRcShellAdapter(shell, home, join(home, ".envden"), backups);

        const original =
          operation === "install" ? "# user\n" : `# user\n${adapter.hookSnippet("/opt/envden")}`;

        await writeFile(target, original);
        await mkdir(dirname(adapter.rcPath()), { recursive: true });
        await symlink(target, adapter.rcPath());

        if (operation === "install") await adapter.install("/opt/envden");
        else await adapter.uninstall();

        expect(await adapter.installed()).toBe(operation === "install");
        expect((await lstat(adapter.rcPath())).isSymbolicLink()).toBe(true);
        expect(await readFile(target, "utf8")).toStartWith("# user\n");
        const names = await readdir(backups);
        expect(names).toHaveLength(1);
        expect(names[0]).toMatch(/^\.envden-backup-[0-9a-f-]{36}$/);
        const backup = join(backups, names[0]!);
        expect(await readFile(backup, "utf8")).toBe(original);
        if (process.platform !== "win32") expect((await stat(backup)).mode & 0o777).toBe(0o600);
        if (process.platform !== "win32") expect((await stat(backups)).mode & 0o777).toBe(0o700);
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    });

// ~/.config/fish -> dotfiles/fish, and ~/.zshrc -> a dotfiles file not created yet
for (const shell of ["fish", "zsh"] as const)
  test(`${shell} install and uninstall write through a linked folder or dangling link`, async () => {
    const home = await mkdtemp(join(tmpdir(), "envden-rc-dir-"));

    try {
      const adapter = createRcShellAdapter(shell, home, join(home, ".envden"));
      const dotfiles = join(home, "dotfiles");
      await mkdir(dotfiles);
      await mkdir(dirname(adapter.rcPath()), { recursive: true });
      const linked = shell === "fish" ? dirname(adapter.rcPath()) : adapter.rcPath();
      const target = join(dotfiles, basename(adapter.rcPath()));
      await rm(linked, { recursive: true, force: true });
      await symlink(shell === "fish" ? dotfiles : target, linked);

      await adapter.install("/opt/envden");
      expect((await lstat(linked)).isSymbolicLink()).toBe(true);
      expect(await readFile(target, "utf8")).toContain("# >>> envden >>>");

      await adapter.uninstall();
      expect((await lstat(linked)).isSymbolicLink()).toBe(true);
      expect(await readFile(target, "utf8")).toBe("");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
