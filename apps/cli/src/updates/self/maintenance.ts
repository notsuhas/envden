import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import { optionalRead } from "../../state/store/files.ts";
import { installAgent } from "../../agent/install.ts";
import { serviceFile } from "../../agent/service/location.ts";

export async function refreshInstallation(adapters: TAdapters, platform = process.platform) {
  const service = serviceFile(platform, adapters.userHome, adapters.home);

  const tasks: (() => Promise<void>)[] = [
    async () => {
      if (
        (await optionalRead(join(adapters.userHome, ".agents", "skills", "envden", "SKILL.md"))) !==
        undefined
      )
        await installAgent(adapters.userHome, adapters.now);
    },
    async () => {
      // Rewriting the definition moves a service off a binary path the upgrade removed.
      if (service && (await optionalRead(service)) !== undefined) await adapters.hostServer();
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
