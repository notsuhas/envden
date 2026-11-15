import { caseInsensitive } from "./checkout/case.ts";
import { repoFailure } from "./failures/operation.ts";
import type { IRepoAdapter } from "@envden/core/adapters";
import { checkoutAt } from "./checkout/checkout.ts";
import { envFiles } from "./env-files/discovery.ts";
import { isIgnored } from "./ignore/is-ignored.ts";
import { ensureIgnored } from "./ignore/ensure-ignored.ts";
import { resolveSshHost } from "./repo-id/ssh.ts";
import { worktrees } from "./checkout/worktrees.ts";
import { submodules } from "./checkout/submodules.ts";

export function createGitRepoAdapter(
  options: {
    resolveSshHost?: (host: string) => Promise<string>;
    skipFolders?: string[];
  } = {},
): IRepoAdapter {
  return {
    id: "git",
    caseInsensitive: (root, readOnly) => caseInsensitive(root, readOnly).catch(repoFailure),
    checkoutAt: (path) =>
      checkoutAt(path, options.resolveSshHost ?? resolveSshHost).catch(repoFailure),
    worktrees: (checkout) => worktrees(checkout).catch(repoFailure),
    submodules: (checkout) => submodules(checkout).catch(repoFailure),
    envFiles: (checkout, rules) =>
      envFiles(checkout, {
        ...rules,
        extraSkipped: [...(options.skipFolders ?? []), ...(rules?.extraSkipped ?? [])],
      }).catch(repoFailure),
    isIgnored: (checkout, path) => isIgnored(checkout, path).catch(repoFailure),
    ensureIgnored: (checkout, path) => ensureIgnored(checkout, path).catch(repoFailure),
  };
}
