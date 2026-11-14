import { execTrustedSync } from "@envden/core/process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, join } from "node:path";
import { start } from "../markers.ts";

export function powerShellProfile(
  run = execTrustedSync,
  home = homedir(),
  platform = process.platform,
): string | undefined {
  const candidates: string[] = [];

  for (const shell of ["pwsh", "powershell"]) {
    try {
      const path = run(
        shell,
        ["-NoProfile", "-NonInteractive", "-Command", "$PROFILE.CurrentUserCurrentHost"],
        { timeout: 5000 },
      ).trim();

      const within = relative(home, path);

      if (
        isAbsolute(path) &&
        within &&
        !within.startsWith("..") &&
        !isAbsolute(within) &&
        !/[\r\n]/.test(path)
      )
        candidates.push(path);
    } catch {
      continue;
    }
  }

  const defaults =
    platform === "win32"
      ? [
          join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
          join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1"),
        ]
      : [join(home, ".config", "powershell", "Microsoft.PowerShell_profile.ps1")];

  return [...candidates, ...defaults].find(hasHook) ?? candidates[0];
}

function hasHook(path: string) {
  try {
    return readFileSync(path, "utf8").includes(start);
  } catch {
    return false;
  }
}
