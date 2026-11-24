import { execTrustedSync } from "@envden/core/process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, basename, join } from "node:path";
import { start } from "../markers.ts";

export function powerShellProfile(run = execTrustedSync, home = homedir()): string | undefined {
  const reported = reportedProfile(run);
  const fallback = join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1");

  return [reported, fallback].find((path) => path !== undefined && hasHook(path)) ?? reported;
}

function reportedProfile(run: typeof execTrustedSync) {
  try {
    const path = run(
      "pwsh",
      ["-NoProfile", "-NonInteractive", "-Command", "$PROFILE.CurrentUserCurrentHost"],
      { timeout: 5000 },
    ).replace(/\r?\n$/, "");

    if (
      isAbsolute(path) &&
      basename(path) === "Microsoft.PowerShell_profile.ps1" &&
      !Array.from(path).some((character) => {
        const code = character.charCodeAt(0);

        return code < 32 || (code >= 127 && code <= 159);
      })
    )
      return path;
  } catch {
    return undefined;
  }

  return undefined;
}

function hasHook(path: string) {
  try {
    return readFileSync(path, "utf8").includes(start);
  } catch {
    return false;
  }
}
