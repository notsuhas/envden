import { join, dirname, resolve } from "node:path";
import { EnvdenError } from "@envden/core/errors";
import { optionalRead } from "../state/store/files.ts";

const BREW_UPGRADE = ["brew", "upgrade", "envden"];

export async function installMethod(home: string, recorded?: string, binary = process.execPath) {
  const detected = detectedMethod(binary, home);

  const value =
    (detected !== "script" ? detected : undefined) ??
    recorded ??
    process.env.ENVDEN_INSTALL_METHOD ??
    (await optionalRead(join(home, "install-method"))) ??
    detected;

  if (value !== "script" && value !== "brew")
    throw new EnvdenError(
      "INVALID_INPUT",
      "Install method is unknown; reinstall using your installer",
    );

  return value === "script"
    ? { kind: "script" as const }
    : { kind: "manager" as const, command: BREW_UPGRADE };
}

function detectedMethod(binary: string, home: string) {
  if (/\/Cellar\/envden\//.test(binary)) return "brew";

  return resolve(dirname(binary)) === resolve(home, "bin") ? "script" : undefined;
}
