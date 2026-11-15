import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import { installAgent } from "../../agent/install.ts";
import { serviceFile } from "../../agent/service/location.ts";
import { DEFAULT_SERVER_PORT, installedPort } from "../../agent/service/port.ts";

export async function refreshInstallation(adapters: TAdapters, platform = process.platform) {
  const service = serviceFile(platform, adapters.userHome, adapters.home);

  const tasks: (() => Promise<void>)[] = [
    async () => {
      if (await present(join(adapters.userHome, ".agents", "skills", "envden", "SKILL.md")))
        await installAgent(adapters.userHome, adapters.now);
    },
    async () => {
      // Rewriting the definition moves a service off a binary path the upgrade removed.
      if (service && (await present(service)))
        await adapters.hostServer(
          installedPort(await readFile(service, "utf8")) ?? DEFAULT_SERVER_PORT,
        );
    },
    ...(["zsh", "bash", "fish", "powershell"] as const).map((shell) => async () => {
      const adapter = adapters.shell(shell);
      if (await adapter.installed()) await adapter.install(adapters.executable);
    }),
  ];

  for (const task of tasks) {
    try {
      await task();
    } catch {
      console.error("envden: binary updated; optional installation refresh failed");
    }
  }
}

// these files may link into a dotfiles repo, so follow links
function present(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}
