import type { TFetch } from "./client/fetch.ts";
import { installHostService, runServiceCommand } from "./agent/service/install.ts";
import { atomicWrite } from "./state/store/files.ts";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createOsKeychainAdapter } from "@envden/adapter-keychain-os";
import { createGitRepoAdapter } from "@envden/adapter-repo-git";
import { createFsPlacementAdapter, pruneBackups } from "@envden/adapter-placement-fs";
import { createRcShellAdapter } from "@envden/adapter-shell-rc";
import { createTailscaleNetworkAdapter } from "@envden/adapter-network-tailscale";
import type { IKeychainAdapter, TPlacementMode } from "@envden/core/adapters";

export function createAdapters(options?: {
  home?: string;
  userHome: string;
  keychain: IKeychainAdapter;
  fetcher?: TFetch;
}) {
  const userHome = options?.userHome ?? homedir();
  const home = resolve(options?.home ?? process.env.ENVDEN_HOME ?? join(userHome, ".envden"));

  return {
    prunePlacementBackups: (now: number) => pruneBackups(join(home, "conflicts"), now, 30),
    home,
    userHome,
    fetcher: options?.fetcher ?? fetch,
    keychain:
      options?.keychain ??
      createOsKeychainAdapter({ home, fileOnly: process.env.ENVDEN_KEYCHAIN === "file" }),
    repo: createGitRepoAdapter(),
    placement: (mode: TPlacementMode, root: string) =>
      createFsPlacementAdapter(mode, root, join(home, "conflicts")),
    shell: (shell: "zsh" | "bash" | "fish" | "powershell") =>
      createRcShellAdapter(shell, userHome, home, join(home, "conflicts")),
    network: createTailscaleNetworkAdapter(),
    hostServer: () =>
      installHostService({
        platform: process.platform,
        executable: process.execPath,
        userHome,
        home,
        uid: process.getuid?.() ?? 0,
        write: atomicWrite,
        run: runServiceCommand,
      }),
  };
}

export type TAdapters = ReturnType<typeof createAdapters>;
