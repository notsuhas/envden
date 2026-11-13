import { accessSync, constants, existsSync, realpathSync, statSync, type Stats } from "node:fs";
import { delimiter, dirname, isAbsolute, join, parse } from "node:path";
import { EnvdenError } from "../errors/index.ts";

// Homebrew's prefix is itself a git repository, but it is a package manager root, not a user checkout.
const MANAGER_ROOTS = ["/opt/homebrew", "/usr/local/Homebrew", "/home/linuxbrew/.linuxbrew"];

export function insideWorkingTree(path: string, managerRoots = MANAGER_ROOTS): boolean {
  let directory = path;

  while (true) {
    if (existsSync(join(directory, ".git"))) return !managerRoots.includes(directory);
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

function trustedDirectory(path: string): boolean {
  if (!isAbsolute(path)) return false;

  try {
    const canonical = realpathSync(path);
    if (insideWorkingTree(path) || insideWorkingTree(canonical)) return false;
    const info = statSync(canonical);

    return info.isDirectory() && trustedOwnerAndMode(info);
  } catch {
    return false;
  }
}

export function trustedDirectories(path = process.env.PATH ?? ""): string[] {
  const system =
    process.platform === "win32"
      ? [
          "C:\\Windows\\System32",
          "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
          "C:\\Program Files\\Git\\cmd",
          "C:\\Program Files\\Tailscale",
        ]
      : [
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
          "/opt/homebrew/bin",
          "/usr/local/bin",
          "/Applications/Tailscale.app/Contents/MacOS",
        ];

  return [...new Set([...path.split(delimiter), ...system])].filter(trustedDirectory);
}

export function resolveTrustedExecutable(name: string, options: { path?: string } = {}): string {
  const candidates = isAbsolute(name)
    ? [name]
    : trustedDirectories(options.path).flatMap((dir) =>
        (process.platform === "win32" && !parse(name).ext
          ? [name, `${name}.exe`, `${name}.com`]
          : [name]
        ).map((file) => join(dir, file)),
      );

  for (const candidate of candidates) {
    if (!isAbsolute(name) && parse(name).base !== name) break;

    try {
      const real = realpathSync(candidate);
      const info = statSync(real);
      if (!trustedDirectory(dirname(candidate)) || !trustedDirectory(dirname(real))) continue;

      if (!info.isFile() || !trustedOwnerAndMode(info)) continue;

      accessSync(real, constants.X_OK);

      return real;
    } catch {
      continue;
    }
  }

  throw new EnvdenError("INVALID_INPUT", "Trusted executable unavailable");
}

// Group write is allowed only for root's group and macOS's admin group, whose members can already sudo.
const PRIVILEGED_GROUPS = new Set([0, 80]);

export function trustedOwnerAndMode(info: Pick<Stats, "mode" | "uid" | "gid">): boolean {
  if (process.platform === "win32") return true;
  if ((info.mode & 0o002) !== 0) return false;
  if ((info.mode & 0o020) !== 0 && !PRIVILEGED_GROUPS.has(info.gid)) return false;

  return info.uid === 0 || info.uid === process.getuid?.();
}
