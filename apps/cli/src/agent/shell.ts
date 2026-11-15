import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";

export async function manageShell(
  adapters: TAdapters,
  action: "install" | "uninstall",
  shell: string,
) {
  if (shell === "none") return;

  if (shell !== "zsh" && shell !== "bash" && shell !== "fish" && shell !== "powershell")
    throw new EnvdenError("INVALID_INPUT", "Unknown shell");

  const adapter = adapters.shell(shell);

  if (action === "install") await adapter.install(adapters.executable);
  else await adapter.uninstall();
}
