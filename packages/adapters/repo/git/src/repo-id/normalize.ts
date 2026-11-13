import { remoteParts } from "./remote.ts";

export function normalizeRepoId(remote: string, resolvedHostname?: string): string {
  const parts = remoteParts(remote.trim());
  const host = (resolvedHostname ?? parts.host).toLowerCase();
  let path = parts.path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (host === "github.com" || host === "gitlab.com") path = path.toLowerCase();

  if (
    !host ||
    /[\\/\s\0]/.test(host) ||
    !path ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\\0\r\n]/.test(path)
  )
    throw new Error("Unsafe git remote");

  return `${host}/${path}`;
}
