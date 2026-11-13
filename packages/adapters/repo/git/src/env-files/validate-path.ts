import { isAbsolute } from "node:path";

export function validatePath(path: string): void {
  if (
    !path ||
    isAbsolute(path) ||
    /^[A-Za-z]:/.test(path) ||
    /[\\\0\r\n]/.test(path) ||
    path.split("/").some((part) => part === ".." || part === "." || !part)
  )
    throw new Error("Unsafe checkout path");
}
