import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ICheckout } from "@envden/core/adapters";
import { createMemoryKeychainAdapter } from "@envden/testing/keychain";
import { createFakeRepoAdapter } from "@envden/testing/repo";
import { createAdapters } from "../../../adapters.ts";

export const clock = () => 1800000000000;

export async function fixture(envFiles = [".env"]) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "envden-takeover-")));

  const adapters = createAdapters(
    { home: join(root, "envden"), userHome: root, keychain: createMemoryKeychainAdapter([]) },
    clock,
  );

  const checkouts: ICheckout[] = [];

  const checkout = async (path: string, repoId: string, target: string) => {
    const item = { root: join(root, path), gitDir: join(root, "main", ".git"), repoId };
    await mkdir(item.root, { recursive: true });
    await symlink(target, join(item.root, ".env"));
    checkouts.push(item);

    return item;
  };

  adapters.repo = createFakeRepoAdapter({
    envFiles: async () => envFiles,
    ensureIgnored: async () => {},
    caseInsensitive: async () => false,
    checkoutAt: async (path) => checkouts.find((item) => item.root === path),
  });

  const errors: string[] = [];
  const original = console.error;
  console.error = (line: string) => errors.push(line);

  const close = async () => {
    console.error = original;
    await rm(root, { recursive: true, force: true });
  };

  return { root, adapters, checkout, errors, close };
}
