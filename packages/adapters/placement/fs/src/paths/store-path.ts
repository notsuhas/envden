import { homedir } from "node:os";
import { join } from "node:path";
import { validatePulledPath } from "./validate-pulled-path.ts";

export function storePathFor(
  repoId: string,
  pathInRepo: string,
  root = join(homedir(), ".envden", "store"),
): string {
  return join(root, validatePulledPath(repoId), validatePulledPath(pathInRepo));
}
