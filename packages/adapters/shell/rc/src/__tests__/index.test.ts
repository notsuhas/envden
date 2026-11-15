import { execTrusted, spawnTrusted } from "@envden/core/process";
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

    expect(snippet).toContain(
      shell === "powershell"
        ? "(Get-Location).ProviderPath"
        : shell === "zsh"
          ? "${PWD:A}"
          : "pwd -P",
    );

    expect(snippet).toContain(
      shell === "powershell"
        ? ".TotalSeconds -gt 60"
        : shell === "fish"
          ? ") -gt 60"
          : '" -gt 60 ]; then',
    );

    expect(() => adapter.hookSnippet("relative")).toThrow();
  });
}

for (const shell of (process.platform === "win32" ? [] : ["bash", "zsh"]) as readonly (
  | "bash"
  | "zsh"
)[]) {
  test.skipIf(process.platform === "win32" || !Bun.which(shell))(
    `${shell} prints only inside an approved checkout and sanitizes refresh`,
    async () => {
      const home = await realpath(await mkdtemp(join(tmpdir(), "envden-hook-")));
      const { mkdir, utimes, symlink } = await import("node:fs/promises");

      try {
        const state = join(home, ".envden", "state");
        const checkout = join(home, "repo");
        const sibling = join(home, "repo-other");
        const alias = join(home, "alias");
        await mkdir(state, { recursive: true });
        await mkdir(checkout);
        await mkdir(sibling);
        await symlink(checkout, alias);
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
          const child = spawnTrusted(
            [shell, "-c", `cd -- "$1"\n${snippet}\n_envden_notice\n_envden_notice`, "--", cwd],
            {
              cwd,
              stdout: "pipe",
              stderr: "pipe",
              env: {
                ...process.env,
                BUN_OPTIONS: "poison",
                BUN_BE_BUN: "1",
                ENVDEN_TEST_RESULT: join(home, "result"),
              },
            },
          );

          expect(await child.exited).toBe(0);
          expect(await new Response(child.stderr).text()).toBe("");

          return new Response(child.stdout).text();
        };

        expect((await run(checkout)).match(/out of sync/g)).toHaveLength(1);
        expect(await run(sibling)).toBe("");
        expect((await run(alias)).match(/out of sync/g)).toHaveLength(1);
        const spelling = checkout.slice(0, -4) + "REPO";

        if (
          await import("node:fs/promises").then((fs) =>
            fs.access(spelling).then(
              () => true,
              () => false,
            ),
          )
        )
          expect((await run(spelling)).match(/out of sync/g)).toHaveLength(1);

        expect(Bun.file(join(home, "result")).size).toBe(0);
        await utimes(join(state, "notice"), new Date(0), new Date(0));
        await execTrusted("mkfifo", [join(home, "result")]);
        const refreshed = readFile(join(home, "result"), "utf8");
        await run(checkout);
        expect(await refreshed).toBe("refreshed\n");
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

for (const shell of (process.platform === "win32" ? [] : ["bash", "zsh"]) as readonly (
  | "bash"
  | "zsh"
)[])
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
        const child = spawnTrusted([shell, "-c", snippet], {
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

test("PowerShell doubles all single quote delimiters in paths", () => {
  const path = join(tmpdir(), "a’‘‚‛b");
  const snippet = createRcShellAdapter("powershell").hookSnippet(path);
  expect(snippet).toContain("a’’‘‘‚‚‛‛b");
});

test("bash hook preserves the exit status for following prompt commands", async () => {
  if (process.platform === "win32" || !Bun.which("bash")) return;
  const home = await mkdtemp(join(tmpdir(), "envden-status-"));

  try {
    const snippet = createRcShellAdapter("bash", home).hookSnippet("/bin/true");

    const { stdout } = await execTrusted("bash", [
      "-c",
      `${snippet}\nfalse; _envden_notice; printf '%s' "$?"; unset _envden_last_pwd; false; _envden_notice; printf '%s' "$?"`,
    ]);

    expect(stdout).toBe("11");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("fish escapes backslashes and quotes in paths and avoids fish 3.5 builtins", () => {
  const adapter = createRcShellAdapter("fish", "/home/test", "/tmp/h\\'o");
  const snippet = adapter.hookSnippet("/tmp/a\\';echo INJECTED;#");
  expect(snippet).toContain("'/tmp/a\\\\\\';echo INJECTED;#' status --refresh-cache");
  expect(snippet).toContain("'/tmp/h\\\\\\'o/state/notice'");
  expect(snippet).not.toContain("path dirname");
});

test("PowerShell refresh arguments work on Windows PowerShell 5.1", () => {
  const snippet = createRcShellAdapter("powershell").hookSnippet(join(tmpdir(), "envden"));
  expect(snippet).toContain("$info.Arguments = 'status --refresh-cache'");
  expect(snippet).not.toContain("ArgumentList");
});
