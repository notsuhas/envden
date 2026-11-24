import { spawnTrusted } from "@envden/core/process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
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
      await managerUpdate(["brew", "upgrade", "envden"], "/checkout/envden", async () => {
        throw new Error("must not ask");
      }),
    ).toEqual({ kind: "manual" });

    expect(output.mock.calls.flat()).toContainEqual(expect.stringContaining("brew upgrade envden"));
  } finally {
    output.mockRestore();
  }
});

test("brew children exclude checkout interpreters and injected options", async () => {
  const root = await mkdtemp(join(tmpdir(), "envden-manager-"));
  const before = { ...process.env };

  try {
    const marker = join(root, "executed");

    const checkout = join(root, "checkout");
    await mkdir(join(checkout, ".git"), { recursive: true });

    await writeFile(join(checkout, "node"), `#!/bin/sh\necho compromised > "${marker}"\n`, {
      mode: 0o755,
    });

    process.env.PATH = `${checkout}${delimiter}${before.PATH}`;
    process.env.NODE_OPTIONS = "--require=checkout";
    process.env.BUN_OPTIONS = "--preload=checkout";
    process.env.npm_config_prefix = root;
    process.env.HOMEBREW_BASH_COMMAND = join(root, "payload.sh");
    process.env.NODE_PATH = root;
    process.env.GIT_EXEC_PATH = root;

    let calls = 0;

    await managerUpdate(
      ["brew", "upgrade", "envden"],
      "/opt/homebrew/bin/envden",
      async () => true,
      async (_args, env, managerBin) => {
        calls++;
        expect(managerBin).toBeTruthy();
        if (!env) throw new Error("Expected sanitized environment");

        expect(
          Object.keys(env).some((key) =>
            /^(node_options|bun_options|npm_config_.*|homebrew_.*|node_path|git_.*)$/i.test(key),
          ),
        ).toBe(false);

        expect(env.PATH).not.toContain(checkout);

        // brew keeps the user's config so taps trusted with `brew trust` still load
        expect(env.HOMEBREW_XDG_CONFIG_HOME).toBeUndefined();

        await spawnTrusted(["bun", "--version"], {
          env,
          stdout: "ignore",
          stderr: "ignore",
        }).exited;
      },
    );

    expect(calls).toBe(2);
    expect(await Bun.file(marker).exists()).toBe(false);
  } finally {
    process.env = before;
    await rm(root, { recursive: true, force: true });
  }
});

for (const variable of ["HOME", "TMPDIR"])
  test(`manager updates refuse checkout ${variable} before consent or execution`, async () => {
    const root = await mkdtemp(join(tmpdir(), "envden-home-"));
    const before = process.env[variable];
    const output = spyOn(console, "error").mockImplementation(() => {});

    try {
      await mkdir(join(root, ".git"));
      await mkdir(join(root, "home"));

      if (variable !== "HOME") {
        const child = spawnTrusted(
          [
            process.execPath,
            "-e",
            `
          const { managerUpdate } = await import(${JSON.stringify(import.meta.resolve("../self/execute.ts"))});
          const result = await managerUpdate(["brew", "upgrade", "envden"], "/opt/homebrew/bin/envden", async () => { throw new Error("must not ask"); });
          if (result.kind !== "manual") throw new Error("must refuse");
        `,
          ],
          {
            env: { TMPDIR: join(root, "home") },
          },
        );

        expect(await child.exited).toBe(0);

        expect(await new Response(child.stderr).text()).toContain(
          "Run manually: brew upgrade envden",
        );

        return;
      }

      process.env[variable] = join(root, "home");

      expect(
        await managerUpdate(
          ["brew", "upgrade", "envden"],
          "/opt/homebrew/bin/envden",
          async () => {
            throw new Error("must not ask");
          },
          async () => {
            throw new Error("must not execute");
          },
        ),
      ).toEqual({ kind: "manual" });

      expect(output.mock.calls.flat()).toContainEqual(
        expect.stringContaining("brew upgrade envden"),
      );
    } finally {
      process.env[variable] = before;
      output.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
