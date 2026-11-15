import { delimiter } from "node:path";
import { trustedDirectories } from "./trust.ts";

// Package managers honour many code-loading variables (HOMEBREW_*, NODE_PATH, GIT_*), so only these pass through.
const ALLOWED = new Set(
  [
    "HOME",
    // Homebrew keeps `brew trust` approvals under it when set
    "XDG_CONFIG_HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "TERM",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "HOMEDRIVE",
    "HOMEPATH",
  ].map((key) => key.toLowerCase()),
);

function allowed(key: string): boolean {
  const lower = key.toLowerCase();

  return ALLOWED.has(lower) || lower.startsWith("lc_");
}

export function sanitizedEnvironment(
  extra: Record<string, string | undefined> = {},
  inherited = process.env,
  managerBin?: string,
) {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(inherited)) {
    if (value !== undefined && allowed(key)) env[key] = value;
  }

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && key.toUpperCase() !== "PATH") env[key] = value;
  }

  env.PATH = trustedDirectories(undefined, managerBin).join(delimiter);

  return env;
}
