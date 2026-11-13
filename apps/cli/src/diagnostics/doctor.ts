import { mkdtemp, symlink, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createOsKeychainAdapter } from "@envden/adapter-keychain-os";
import { createRcShellAdapter } from "@envden/adapter-shell-rc";
import { createTailscaleNetworkAdapter } from "@envden/adapter-network-tailscale";
import { ensurePaths } from "../settings/paths.ts";

export async function doctor() {
  const location = await ensurePaths();
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

  const keychain = await createOsKeychainAdapter().available();

  const shells = await Promise.all(
    (["zsh", "bash", "fish", "powershell"] as const).map(async (shell) => {
      const adapter = createRcShellAdapter(shell);

      return { shell, path: adapter.rcPath(), installed: await adapter.installed() };
    }),
  );

  return {
    keychain: keychain ? "os" : "file-fallback",
    symlinks,
    tailscale: await createTailscaleNetworkAdapter().status(),
    shells,
  };
}
