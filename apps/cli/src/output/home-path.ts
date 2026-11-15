import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

export function homePath(path: string, userHome: string): string {
  const rest = relative(userHome, path);

  if (rest === "") return "~";
  if (rest === ".." || rest.startsWith(`..${sep}`) || isAbsolute(rest)) return path;

  return `~${sep}${rest}`;
}

// Checkout roots are real paths, so compare against the real home (/tmp is /private/tmp on macOS).
export function realHome(userHome: string): Promise<string> {
  return realpath(userHome).catch(() => userHome);
}
