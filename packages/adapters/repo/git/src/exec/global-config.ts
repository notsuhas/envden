import { EnvdenError } from "@envden/core/errors";
import { execTrusted as exec } from "@envden/core/process";

export type TConfigEntry = [key: string, value: string];

export async function globalConfig(pattern: string): Promise<TConfigEntry[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["config", "--global", "--null", "--get-regexp", pattern],
      {
        env: { GIT_CONFIG_NOSYSTEM: "1" },
      },
    );

    return parseEntries(stdout);
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

function parseEntries(stdout: string): TConfigEntry[] {
  return stdout.split("\0").flatMap((entry) => {
    const split = entry.indexOf("\n");

    return split === -1 ? [] : [[entry.slice(0, split), entry.slice(split + 1)] as TConfigEntry];
  });
}
