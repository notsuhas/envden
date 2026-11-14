import { execTrustedSync } from "@envden/core/process";
import { isAbsolute } from "node:path";

export function powerShellProfile(run = execTrustedSync): string | undefined {
  for (const shell of ["pwsh", "powershell"]) {
    try {
      const path = run(shell, [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$PROFILE.CurrentUserCurrentHost",
      ]).trim();

      if (isAbsolute(path) && !/[\r\n]/.test(path)) return path;
    } catch {
      continue;
    }
  }

  return undefined;
}
