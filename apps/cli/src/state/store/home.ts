import { join } from "node:path";

// An empty ENVDEN_HOME counts as unset, so state never lands in the working directory.
export function envdenHome(override: string | undefined, userHome: string) {
  return override || join(userHome, ".envden");
}
