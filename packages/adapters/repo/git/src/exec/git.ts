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
      },
    },
  );

  return stdout;
}
