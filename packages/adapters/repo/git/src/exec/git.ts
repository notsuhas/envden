import { devNull } from "node:os";
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
        GIT_CONFIG_GLOBAL: devNull,
      },
    },
  );

  return stdout;
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
