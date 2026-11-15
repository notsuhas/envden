import { EnvdenError } from "@envden/core/errors";
import { access } from "node:fs/promises";
import type { TFetch } from "./client/fetch.ts";
import { installHostService, runServiceCommand } from "./agent/service/install.ts";
import { chooseServerPort, systemPortProbe } from "./agent/service/port.ts";
import { writeThrough } from "./agent/write-through.ts";
import { realLocation } from "./state/store/real-location.ts";
import { stableExecutable } from "./updates/self/paths.ts";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { createFileKeychainAdapter } from "@envden/adapter-keychain-file";
import { createGitRepoAdapter } from "@envden/adapter-repo-git";
import { createFsPlacementAdapter, pruneBackups } from "@envden/adapter-placement-fs";
import { createRcShellAdapter } from "@envden/adapter-shell-rc";
import { createTailscaleNetworkAdapter } from "@envden/adapter-network-tailscale";
import { localSetupToken } from "@envden/server";
import type { IKeychainAdapter, IPlacementAdapter, TPlacementMode } from "@envden/core/adapters";

export function createAdapters(
  options:
    | {
        home?: string;
        userHome: string;
        keychain: IKeychainAdapter;
        fetcher?: TFetch;
        executable?: string;
        hostname?: string;
      }
    | undefined,
  now: () => number,
) {
  const userHome = options?.userHome ?? homedir();
  const home = realLocation(options?.home ?? process.env.ENVDEN_HOME ?? join(userHome, ".envden"));
  const executable = stableExecutable(options?.executable ?? process.execPath);

  const adapters = {
    now,
    prunePlacementBackups: (now: number) => pruneBackups(join(home, "conflicts"), now, 30),
    home,
    userHome,
    executable,
    hostname: options?.hostname ?? hostname(),
    fetcher: options?.fetcher ?? fetch,
    keychain: options?.keychain ?? deviceKeychain(home),
    repo: createGitRepoAdapter({ storeRoot: join(home, "store") }),
    placement: (mode: TPlacementMode, root: string): IPlacementAdapter => {
      const placement = createFsPlacementAdapter(mode, root, join(home, "conflicts"), now);

      return {
        ...placement,
        place: (store, destination, prepare) =>
          placement.place(
            store,
            destination,
            prepare ??
              (async (path) => {
                const checkout = await adapters.repo.checkoutAt(root);
                if (!checkout) throw new EnvdenError("NOT_FOUND", "Checkout is unavailable");
                await adapters.repo.ensureIgnored(checkout, path);
              }),
          ),
      };
    },
    shell: (shell: "zsh" | "bash" | "fish" | "powershell") =>
      createRcShellAdapter(shell, userHome, home, join(home, "conflicts")),
    network: createTailscaleNetworkAdapter(),
    serverPort: () => chooseServerPort(systemPortProbe),
    localSetupToken: () => localSetupToken(join(home, "server"), now()),
    hostServer: (port: number) =>
      installHostService(
        {
          platform: process.platform,
          executable,
          userHome,
          home,
          port,
          uid: process.getuid?.() ?? 0,
          write: (path, bytes) => writeThrough(path, bytes, now),
          run: runServiceCommand,
          pause: (ms) => Bun.sleep(ms),
        },
        now,
      ),
  };

  return adapters;
}

export type TAdapters = ReturnType<typeof createAdapters>;

function deviceKeychain(home: string): IKeychainAdapter {
  const keychain = createFileKeychainAdapter({ home });

  return {
    ...keychain,
    get: async (name, required) => {
      const deviceExists =
        name === `envden/${home}/device` &&
        (await access(join(home, "state", "device.json")).then(
          () => true,
          () => false,
        ));

      return keychain.get(name, required || deviceExists);
    },
  };
}
