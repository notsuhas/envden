import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRcShellAdapter } from "../index.ts";

for (const shell of ["zsh", "bash", "fish", "powershell"] as const) {
  test.skipIf(process.platform === "win32")(`${shell} hook snapshot`, () => {
    const adapter = createRcShellAdapter(shell, "/home/test", "/home/test/.envden");
    const snippet = adapter.hookSnippet("/opt/envden's bin/envden");
    expect(snippet).toMatchSnapshot();
    expect(snippet).not.toContain("git ");
    expect(snippet).toContain("60");
    expect(() => adapter.hookSnippet("relative")).toThrow();
  });
}

test("rc install is idempotent and uninstall preserves user content", async () => {
  const home = await mkdtemp(join(tmpdir(), "envden-shell-"));

  try {
    const adapter = createRcShellAdapter("bash", home);
    await writeFile(adapter.rcPath(), "# user config\n");
    await adapter.install("/opt/envden");
    const first = await readFile(adapter.rcPath(), "utf8");
    await adapter.install("/opt/envden");
    expect(await readFile(adapter.rcPath(), "utf8")).toBe(first);
    expect(await adapter.installed()).toBe(true);
    await adapter.uninstall();
    expect(await readFile(adapter.rcPath(), "utf8")).toBe("# user config\n");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

for (const shell of ["bash", "zsh"] as const) {
  test.skipIf(process.platform === "win32" || !Bun.which(shell))(
    `${shell} prints only inside an approved checkout and sanitizes refresh`,
    async () => {
      const home = await realpath(await mkdtemp(join(tmpdir(), "envden-hook-")));
      const { mkdir, utimes } = await import("node:fs/promises");

      try {
        const state = join(home, ".envden", "state");
        const checkout = join(home, "repo");
        const sibling = join(home, "repo-other");
        await mkdir(state, { recursive: true });
        await mkdir(checkout);
        await mkdir(sibling);
        await writeFile(join(state, "approved-checkouts"), `${checkout}\n`);
        await writeFile(join(state, "notice"), "envden: out of sync\n");
        const binary = join(home, "envden");

        await writeFile(
          binary,
          '#!/bin/sh\n[ -z "${BUN_OPTIONS+x}" ] && [ -z "${BUN_BE_BUN+x}" ] && echo refreshed > "$ENVDEN_TEST_RESULT"\n',
          { mode: 0o700 },
        );

        const snippet = createRcShellAdapter(shell, home).hookSnippet(binary);

        const run = async (cwd: string) => {
          const child = Bun.spawn([shell, "-c", `${snippet}\n_envden_notice\n_envden_notice`], {
            cwd,
            stdout: "pipe",
            stderr: "pipe",
            env: {
              ...process.env,
              BUN_OPTIONS: "poison",
              BUN_BE_BUN: "1",
              ENVDEN_TEST_RESULT: join(home, "result"),
            },
          });

          expect(await child.exited).toBe(0);

          return new Response(child.stdout).text();
        };

        expect((await run(checkout)).match(/out of sync/g)).toHaveLength(1);
        expect(await run(sibling)).toBe("");
        expect(Bun.file(join(home, "result")).size).toBe(0);
        await utimes(join(state, "notice"), new Date(0), new Date(0));
        await run(checkout);

        for (
          let attempt = 0;
          attempt < 200 && !(await Bun.file(join(home, "result")).exists());
          attempt++
        )
          await Bun.sleep(10);

        expect(await readFile(join(home, "result"), "utf8")).toBe("refreshed\n");
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    },
  );
}

test("fish tries GNU stat before the BSD fallback", () => {
  const snippet = createRcShellAdapter("fish").hookSnippet(join(tmpdir(), "envden"));
  expect(snippet.indexOf("stat -c %Y")).toBeLessThan(snippet.indexOf("stat -f %m"));
});

test("PowerShell gates notices on a directory change", () => {
  const snippet = createRcShellAdapter("powershell").hookSnippet(join(tmpdir(), "envden"));
  expect(snippet).toContain("$global:EnvdenLastDirectory -cne $PWD.Path");
  expect(snippet).toContain("if ($changed)");
});

for (const shell of ["bash", "zsh"] as const)
  test(`${shell} caches track offers and update days`, async () => {
    const home = await realpath(await mkdtemp(join(tmpdir(), "envden-offer-")));
    const { mkdir } = await import("node:fs/promises");

    try {
      const state = join(home, ".envden", "state");
      await mkdir(state, { recursive: true });
      await writeFile(join(state, "track-offers"), home + "\n");

      await writeFile(
        join(state, "notice-update"),
        "envden: update available; run envden update\nenvden: update required; run envden update\nmalicious\x1b[31m\n",
      );

      await writeFile(join(state, "notice"), "");
      const snippet = createRcShellAdapter(shell, home).hookSnippet("/bin/true");

      const run = async () => {
        const child = Bun.spawn([shell, "-c", snippet], {
          cwd: home,
          stdout: "pipe",
          stderr: "pipe",
        });

        expect(await child.exited).toBe(0);

        return new Response(child.stdout).text();
      };

      const first = await run();
      expect(first).toContain("run envden track");
      expect(first).toContain("update available");
      expect(first).not.toContain("malicious");
      expect(await run()).toBe("envden: update required; run envden update\n");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
