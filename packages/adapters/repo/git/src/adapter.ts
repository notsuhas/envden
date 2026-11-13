import { repoFailure } from "./failures/operation.ts";
import type { IRepoAdapter } from "@envden/core/adapters";
import { checkoutAt } from "./checkout/checkout.ts";
import { envFiles } from "./env-files/discovery.ts";
import { isIgnored } from "./ignore/is-ignored.ts";
import { ensureIgnored } from "./ignore/ensure-ignored.ts";
import { resolveSshHost } from "./repo-id/ssh.ts";
import { worktrees } from "./checkout/worktrees.ts";

export function createGitRepoAdapter(
  options: { resolveSshHost?: (host: string) => Promise<string>; skipFolders?: string[] } = {},
): IRepoAdapter {
  return {
    id: "git",
    checkoutAt: (path) =>
      checkoutAt(path, options.resolveSshHost ?? resolveSshHost).catch(repoFailure),
    worktrees: (checkout) => worktrees(checkout).catch(repoFailure),
    envFiles: (checkout) => envFiles(checkout, options.skipFolders).catch(repoFailure),
    isIgnored: (checkout, path) => isIgnored(checkout, path).catch(repoFailure),
    ensureIgnored: (checkout, path) => ensureIgnored(checkout, path).catch(repoFailure),
  };
}
