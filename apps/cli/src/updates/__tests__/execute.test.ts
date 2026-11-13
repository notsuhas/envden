import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, spyOn } from "bun:test";
import { managerUpdate } from "../self/execute.ts";
import { pinnedInstall } from "../self/paths.ts";

for (const [manager, binary, installer, replacement] of [
  [
    "brew",
    "/opt/homebrew/Cellar/envden/1/bin/envden",
    "/opt/homebrew/bin/brew",
    "/opt/homebrew/bin/envden",
  ],
  ["brew", "/usr/local/bin/envden", "/usr/local/bin/brew", "/usr/local/bin/envden"],
  [
    "scoop",
    "C:/Users/me/scoop/apps/envden/1/envden.exe",
    "C:/Users/me/scoop/shims/scoop.cmd",
    "C:/Users/me/scoop/apps/envden/current/envden.exe",
  ],
  [
    "winget",
    "C:/Users/me/AppData/Local/Microsoft/WinGet/Packages/Envden_1/envden.exe",
    "C:/Users/me/AppData/Local/Microsoft/WindowsApps/winget.exe",
    "C:/Users/me/AppData/Local/Microsoft/WinGet/Links/envden.exe",
  ],
])
  test(`${manager} pins installer and replacement without PATH`, async () => {
    const calls: string[][] = [];

    await managerUpdate(
      [manager!, "upgrade", "envden"],
      binary!,
      async () => true,
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toEqual([
      [installer!, "upgrade", "envden"],
      [replacement!, "update", "--post-install"],
    ]);

    expect(pinnedInstall(manager!, "/checkout/envden")).toBeUndefined();
    calls.length = 0;

    await managerUpdate(
      [manager!, "upgrade", "envden"],
      binary!,
      async () => false,
      async (args) => {
        calls.push(args);
      },
    );

    expect(calls).toEqual([]);
  });

test("an unpinned manager prints the manual command and executes nothing", async () => {
  const output = spyOn(console, "error").mockImplementation(() => {});

  try {
    expect(
      await managerUpdate(["npm", "i", "-g", "envden@latest"], "/checkout/envden", async () => {
        throw new Error("must not ask");
      }),
    ).toEqual({ kind: "manual" });

    expect(output.mock.calls.flat()).toContain(
      "envden: Cannot pin installer path. Run manually: npm i -g envden@latest",
    );
  } finally {
    output.mockRestore();
  }
});

for (const manager of ["brew", "npm", "scoop", "winget"]) {
  test(`${manager} children exclude checkout interpreters and injected options`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-manager-"));
    const before = { ...process.env };

    try {
      const marker = join(root, "executed");

      await writeFile(join(root, "node"), `#!/bin/sh\necho compromised > "${marker}"\n`, {
        mode: 0o755,
      });

      process.env.PATH = `${root}:${before.PATH}`;
      process.env.NODE_OPTIONS = "--require=checkout";
      process.env.BUN_OPTIONS = "--preload=checkout";
      process.env.npm_config_prefix = root;
      process.env.NPM_CONFIG_USERCONFIG = join(root, "npmrc");
      const bin = join(root, "prefix", "bin");
      await mkdir(bin, { recursive: true });
      await symlink(process.execPath, join(bin, "node"));
      const cli = join(root, "prefix", "lib", "node_modules", "npm", "bin", "npm-cli.js");
      await mkdir(join(cli, ".."), { recursive: true });
      await writeFile(cli, "process.exit(0)");

      const binaries: Record<string, string> = {
        brew: "/opt/homebrew/bin/envden",
        npm: join(bin, "envden"),
        scoop: "C:/Users/me/scoop/apps/envden/1/envden.exe",
        winget: "C:/Users/me/AppData/Local/Microsoft/WinGet/Links/envden.exe",
      };

      let calls = 0;

      await managerUpdate(
        [manager, "upgrade", "envden"],
        binaries[manager]!,
        async () => true,
        async (args, env) => {
          calls++;
          expect(env).toBeDefined();
          if (!env) throw new Error("Expected sanitized environment");

          expect(
            Object.keys(env ?? {}).some((key) =>
              /^(node_options|bun_options|npm_config_.*)$/i.test(key),
            ),
          ).toBe(false);

          expect(env?.PATH).not.toContain(root + ":");

          if (manager === "npm" && calls === 1) {
            expect(args.slice(0, 2)).toEqual([join(bin, "node"), cli]);
            expect(await Bun.spawn(args.slice(0, 2), { env }).exited).toBe(0);
          } else {
            await Bun.spawn(["/usr/bin/env", "node", "--version"], {
              env,
              stdout: "ignore",
              stderr: "ignore",
            }).exited;

            if (manager === "scoop" || manager === "winget") {
              expect(env.PATH).toMatch(/;[^;]+[\\/]System32$/i);
            }
          }
        },
      );

      expect(calls).toBe(2);
      expect(await Bun.file(marker).exists()).toBe(false);
    } finally {
      process.env = before;
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const missing of ["node", "cli"]) {
  test(`npm refuses when the pinned ${missing} is missing`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-npm-missing-"));
    const output = spyOn(console, "error").mockImplementation(() => {});

    try {
      const bin = join(root, "bin");
      const cli = join(root, "lib", "node_modules", "npm", "bin", "npm-cli.js");
      await mkdir(bin, { recursive: true });
      await mkdir(join(cli, ".."), { recursive: true });

      if (missing === "cli") await symlink(process.execPath, join(bin, "node"));
      else await writeFile(cli, "process.exit(0)");

      const result = await managerUpdate(
        ["npm", "i", "-g", "envden@latest"],
        join(bin, "envden"),
        async () => {
          throw new Error("Must not ask or execute");
        },
      );

      expect(result).toEqual({ kind: "manual" });

      expect(output.mock.calls.flat()).toContain(
        "envden: Cannot pin installer path. Run manually: npm i -g envden@latest",
      );
    } finally {
      output.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
}
