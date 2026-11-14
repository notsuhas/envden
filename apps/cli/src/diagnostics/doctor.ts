import { updateStatus } from "../updates/status.ts";
import { mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { TAdapters } from "../adapters.ts";
import { ensurePaths, type paths } from "../settings/paths.ts";

export async function doctor(adapters: TAdapters, location: ReturnType<typeof paths>) {
  await ensurePaths(location.home);
  const directory = await mkdtemp(join(location.state, "doctor-"));
  let symlinks = false;

  try {
    await writeFile(join(directory, "target"), "", { mode: 0o600 });
    await symlink(join(directory, "target"), join(directory, "link"));
    symlinks = true;
  } catch {
    symlinks = false;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const shells = await Promise.all(
    (["zsh", "bash", "fish", "powershell"] as const).map(async (shell) => {
      const adapter = adapters.shell(shell);

      return { shell, path: adapter.rcPath(), installed: await adapter.installed() };
    }),
  );

  return {
    keychain: (await adapters.keychain.available()) ? "os" : "file-fallback",
    symlinks,
    update: await updateStatus(adapters.home),
    tailscale: await adapters.network.status(),
    https: await adapters.network.checkHttpsCertificate(),
    shells,
  };
}
