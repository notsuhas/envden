import type { TAdapters } from "../adapters.ts";
import type { TShell } from "../onboarding/decisions.ts";

export async function manageShell(
  adapters: TAdapters,
  action: "install" | "uninstall",
  shell: TShell | "none",
) {
  if (shell === "none") return;

  const adapter = adapters.shell(shell);

  if (action === "install") await adapter.install(adapters.executable);
  else await adapter.uninstall();
}
