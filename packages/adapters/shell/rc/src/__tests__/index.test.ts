import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRcShellAdapter } from "../index.ts";

for (const shell of ["zsh", "bash", "fish", "powershell"] as const) {
  test(`${shell} hook snapshot`, () => {
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
  test(`${shell} prints only inside an approved checkout and sanitizes refresh`, async () => {
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
        const child = Bun.spawn([shell, "-c", snippet], {
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

      expect(await run(checkout)).toContain("out of sync");
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
  });
}
