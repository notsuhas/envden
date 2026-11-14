import { EnvdenError } from "@envden/core/errors";
import { relative, resolve } from "node:path";
import { validateLocalPath } from "./validate-pulled-path.ts";

export function checkoutRelative(root: string, path: string): string {
  if (path.split(/[\\/]/).includes(".."))
    throw new EnvdenError("INVALID_INPUT", "Unsafe pulled path");

  return validateLocalPath(relative(root, resolve(path)).split("\\").join("/"));
}
