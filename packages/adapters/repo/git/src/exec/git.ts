import { tmpdir } from "node:os";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { execTrusted as exec } from "@envden/core/process";

const safeConfig = [
  "core.fsmonitor=false",
  "core.untrackedCache=false",
  "core.hooksPath=/dev/null",
  "core.pager=cat",
  "protocol.allow=never",
  "diff.external=",
  "core.sshCommand=false",
  "core.attributesFile=/dev/null",
].flatMap((value) => ["-c", value]);

export async function git(root: string, args: string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "envden-git-config-"));
  const config = join(directory, "config");

  try {
    await writeFile(config, "", { flag: "wx", mode: 0o600 });

    const { stdout } = await exec(
      "git",
      [
        ...safeConfig,
        ...(await safeDirectories()),
        ...(args[0] === "ls-files" ? ["--literal-pathspecs"] : []),
        "-C",
        root,
        ...args,
      ],
      {
        env: {
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: config,
        },
      },
    );

    return stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function safeDirectories() {
  try {
    const { stdout } = await exec(
      "git",
      ["config", "--global", "--null", "--get-all", "safe.directory"],
      {
        env: { GIT_CONFIG_NOSYSTEM: "1" },
      },
    );

    return stdout
      .split("\0")
      .filter(Boolean)
      .flatMap((path) => ["-c", `safe.directory=${path}`]);
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return [];

    throw error;
  }
}
