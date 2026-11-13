import { relative, resolve } from "node:path";
import { validatePulledPath } from "./validate-pulled-path.ts";

export function checkoutRelative(root: string, path: string): string {
  if (path.split(/[\\/]/).includes("..")) throw new Error("Unsafe pulled path");

  return validatePulledPath(relative(root, resolve(path)).split("\\").join("/"));
}
