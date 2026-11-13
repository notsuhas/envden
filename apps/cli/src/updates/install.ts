import { join, dirname, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { optionalRead } from "../state/store/files.ts";

const managers = {
  brew: ["brew", "upgrade", "envden"],
  npm: ["npm", "i", "-g", "envden@latest"],
  scoop: ["scoop", "update", "envden"],
  winget: ["winget", "upgrade", "envden"],
};

export async function installMethod(home: string, recorded?: string, binary = process.execPath) {
  const value =
    recorded ??
    process.env.ENVDEN_INSTALL_METHOD ??
    (await optionalRead(join(home, "install-method"))) ??
    detectedMethod(binary, home);

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

function detectedMethod(binary: string, home: string) {
  const normalized = binary.replaceAll("\\", "/");

  if (
    /\/Cellar\/envden\//.test(normalized) ||
    /^(\/opt\/homebrew|\/usr\/local)\/(bin\/envden|opt\/envden\/bin\/envden)$/.test(normalized)
  )
    return "brew";

  if (/\/Microsoft\/WinGet\/(Packages|Links)\//i.test(normalized)) return "winget";

  return resolve(dirname(binary)) === resolve(home, "bin") ? "script" : undefined;
}
