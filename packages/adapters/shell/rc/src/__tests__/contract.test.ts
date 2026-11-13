import { join } from "node:path";
import { shellContract } from "@envden/testing/shell";
import { createRcShellAdapter } from "../index.ts";

for (const shell of ["zsh", "bash", "fish", "powershell"] as const) {
  shellContract(`RC ${shell}`, (home) => createRcShellAdapter(shell, home, join(home, ".envden")));
}
