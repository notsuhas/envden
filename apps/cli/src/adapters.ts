import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createOsKeychainAdapter } from "@envden/adapter-keychain-os";
import { createGitRepoAdapter } from "@envden/adapter-repo-git";
import { createFsPlacementAdapter } from "@envden/adapter-placement-fs";
import { createRcShellAdapter } from "@envden/adapter-shell-rc";
import { createTailscaleNetworkAdapter } from "@envden/adapter-network-tailscale";
import type { IKeychainAdapter, TPlacementMode } from "@envden/core/adapters";

export function createAdapters(
  options: { home?: string; userHome?: string; keychain?: IKeychainAdapter } = {},
) {
  const userHome = options.userHome ?? homedir();
  const home = resolve(options.home ?? process.env.ENVDEN_HOME ?? join(userHome, ".envden"));

  return {
    home,
    userHome,
    keychain: options.keychain ?? createOsKeychainAdapter({ home }),
    repo: createGitRepoAdapter(),
    placement: (mode: TPlacementMode, root: string) => createFsPlacementAdapter(mode, root),
    shell: (shell: "zsh" | "bash" | "fish" | "powershell") =>
      createRcShellAdapter(shell, userHome, home),
    network: createTailscaleNetworkAdapter(),
  };
}

export type TAdapters = ReturnType<typeof createAdapters>;
