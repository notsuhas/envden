import { posix } from "node:path";

// Package managers honour many code-loading variables (HOMEBREW_*, NODE_PATH, GIT_*), so only these pass through.
const ALLOWED = new Set(
  [
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
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

export function managerEnvironment(manager: string, inherited = process.env) {
  const windows = /^[A-Za-z]:[\\/]/.test(manager);
  const directory = posix.dirname(manager.replaceAll("\\", "/"));

  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(inherited)) {
    if (value !== undefined && allowed(key)) env[key] = value;
  }

  env.PATH = windows
    ? `${directory};${inherited.SystemRoot ?? "C:\\Windows"}\\System32`
    : `${directory}:/usr/bin:/bin:/usr/sbin:/sbin`;

  return env;
}
