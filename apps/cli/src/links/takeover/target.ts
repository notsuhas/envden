import { readFile, stat } from "node:fs/promises";

// a named pipe (1Password's local .env) or a device would block the read, so only regular files count
export async function regularTarget(path: string) {
  return (await stat(path).catch(() => undefined))?.isFile() ?? false;
}

export async function readTarget(path: string) {
  return (await regularTarget(path)) ? readFile(path).catch(() => undefined) : undefined;
}
