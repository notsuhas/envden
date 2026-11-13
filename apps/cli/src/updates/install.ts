import { join, dirname, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { optionalRead } from "../state/files.ts";

const managers = {
  brew: ["brew", "upgrade", "envden"],
  npm: ["npm", "i", "-g", "envden@latest"],
  scoop: ["scoop", "update", "envden"],
  winget: ["winget", "upgrade", "envden"],
};

export async function installMethod(home: string, recorded?: string, binary = process.execPath) {
  const value =
    recorded ??
    (await optionalRead(join(home, "install-method"))) ??
    (resolve(dirname(binary)) === resolve(home, "bin") ? "script" : undefined);

  if (
    value !== "script" &&
    value !== "brew" &&
    value !== "npm" &&
    value !== "scoop" &&
    value !== "winget"
  )
    throw new EnvdenError(
      "INVALID_INPUT",
      "Install method is unknown; reinstall using your installer",
    );

  return value === "script"
    ? { kind: "script" as const }
    : { kind: "manager" as const, command: managers[value] };
}
