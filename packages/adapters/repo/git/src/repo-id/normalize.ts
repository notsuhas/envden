import { EnvdenError } from "@envden/core/errors";
import { remoteParts } from "./remote.ts";

export function normalizeRepoId(remote: string, resolvedHostname?: string): string {
  try {
    return normalize(remote, resolvedHostname);
  } catch (cause) {
    if (cause instanceof EnvdenError) throw cause;
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote", { cause });
  }
}

function normalize(remote: string, resolvedHostname?: string): string {
  if (/[\p{Cc}\p{Cf}]/u.test(decodeURIComponent(remote)))
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

  const parts = remoteParts(remote.trim());
  const host = (resolvedHostname ?? parts.host).toLowerCase();
  let path = parts.path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (host === "github.com" || host === "gitlab.com") path = path.toLowerCase();

  if (/[\p{Cc}\p{Cf}]/u.test(host + path) || !host || /[\\/\s\0]/.test(host) || unsafePath(path))
    throw new EnvdenError("INVALID_INPUT", "Unsafe git remote");

  return `${host}/${path}`;
}

function unsafePath(path: string) {
  return (
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\\p{Cc}\p{Cf}]/u.test(path)
  );
}
