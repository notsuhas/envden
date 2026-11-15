import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";
import { lstat, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeRepoId } from "../repo-id/normalize.ts";
import { registeredWorktree } from "./registration.ts";
import { remoteParts } from "../repo-id/remote.ts";
import { remoteUrl } from "../repo-id/remote-url.ts";

export async function checkoutAt(
  path: string,
  resolveHost: (host: string) => Promise<string>,
): Promise<ICheckout | undefined> {
  let root: string;

  try {
    const stat = await lstat(path);

    root = (
      await git(stat.isDirectory() ? path : dirname(path), ["rev-parse", "--show-toplevel"])
    ).trimEnd();
  } catch (error) {
    if (
      !(
        error instanceof EnvdenError &&
        error.cause &&
        typeof error.cause === "object" &&
        "exitCode" in error.cause
      )
    )
      throw error;

    return undefined;
  }

  const remotes = (await git(root, ["remote"])).trim().split("\n").filter(Boolean);

  const name = remotes.includes("origin")
    ? "origin"
    : remotes.length === 1
      ? remotes[0]
      : undefined;

  if (!name) throw new EnvdenError("INVALID_INPUT", "Choose a git remote for this checkout");
  const remote = await remoteUrl(root, name);
  const parts = remoteParts(remote);
  const repoId = normalizeRepoId(remote, parts.ssh ? await resolveHost(parts.host) : undefined);
  const common = (await git(root, ["rev-parse", "--git-common-dir"])).trimEnd();

  const gitDir = await realpath(resolve(root, common));

  const upstreamRepoId = remotes.includes("upstream")
    ? await upstreamId(root, resolveHost)
    : undefined;

  const directory = await lstat(gitDir);
  const rootStat = await lstat(await realpath(root));

  return {
    identity: `${directory.dev}:${directory.ino}:${directory.birthtimeMs}:${rootStat.ino}:${rootStat.birthtimeMs}`,
    rootDevice: rootStat.dev,
    ...(upstreamRepoId ? { upstreamRepoId } : {}),
    root: await realpath(root),
    repoId,
    gitDir,
    registeredWorktree: await registeredWorktree(root, gitDir),
  };
}

async function upstreamId(root: string, resolveHost: (host: string) => Promise<string>) {
  const remote = await remoteUrl(root, "upstream");
  const parts = remoteParts(remote);

  return normalizeRepoId(remote, parts.ssh ? await resolveHost(parts.host) : undefined);
}
