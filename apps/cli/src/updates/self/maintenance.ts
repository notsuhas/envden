import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import { optionalRead } from "../../state/store/files.ts";
import { installAgent } from "../../agent/install.ts";
import { restartHostService } from "../../agent/service/restart.ts";

export async function refreshInstallation(adapters: TAdapters, binary: string) {
  const tasks: (() => Promise<void>)[] = [
    async () => {
      if (
        (await optionalRead(join(adapters.userHome, ".agents", "skills", "envden", "SKILL.md"))) !==
        undefined
      )
        await installAgent(adapters.userHome, adapters.now);
    },
    () => restartHostService(adapters.userHome, adapters.home),
    ...(["zsh", "bash", "fish", "powershell"] as const).map((shell) => async () => {
      const adapter = adapters.shell(shell);
      if (await adapter.installed()) await adapter.install(binary);
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
