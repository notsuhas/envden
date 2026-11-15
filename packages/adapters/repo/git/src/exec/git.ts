import { emptyGlobalConfig } from "./config.ts";
import { globalConfig, type TConfigEntry } from "./global-config.ts";
import { execTrusted as exec } from "@envden/core/process";

const safeConfig = [
  "safe.bareRepository=explicit",
  "core.fsmonitor=false",
  "core.untrackedCache=false",
  "core.hooksPath=/dev/null",
  "core.pager=cat",
  "protocol.allow=never",
  "diff.external=",
  "core.sshCommand=false",
  "core.attributesFile=/dev/null",
].flatMap((value) => ["-c", value]);

export async function git(root: string, args: string[], input?: string): Promise<string> {
  return (await gitSession(root))(args, input);
}

export async function gitSession(root: string, config: TConfigEntry[] = []) {
  const emptyConfig = await emptyGlobalConfig();

  const directories = (await globalConfig("^safe\\.directory$")).flatMap(([key, value]) => [
    "-c",
    `${key}=${value}`,
  ]);

  return async (args: string[], input?: string): Promise<string> => {
    const { stdout } = await exec(
      "git",
      [
        ...safeConfig,
        ...directories,
        ...(args[0] === "ls-files" ? ["--literal-pathspecs"] : []),
        "-C",
        root,
        ...args,
      ],
      {
        ...(input === undefined ? {} : { stdin: new Blob([input]) }),
        env: {
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          GIT_PAGER: "cat",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: emptyConfig,
          ...configEnvironment(config),
        },
      },
    );

    return stdout;
  };
}

// Env pairs, unlike -c, keep keys that contain "=" intact.
function configEnvironment(config: TConfigEntry[]): Record<string, string> {
  if (config.length === 0) return {};

  return Object.fromEntries([
    ["GIT_CONFIG_COUNT", String(config.length)],
    ...config.flatMap(([key, value], index) => [
      [`GIT_CONFIG_KEY_${index}`, key],
      [`GIT_CONFIG_VALUE_${index}`, value],
    ]),
  ]);
}
