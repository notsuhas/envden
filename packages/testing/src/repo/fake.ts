import type { IRepoAdapter } from "@envden/core/adapters";
import { unexpected } from "../fakes/operation.ts";

export function createFakeRepoAdapter(
  operations: { [K in keyof IRepoAdapter]?: IRepoAdapter[K] | undefined } = {},
): IRepoAdapter {
  const envFiles: IRepoAdapter["envFiles"] =
    operations.envFiles?.bind(operations) ?? unexpected("repo.envFiles");

  return {
    id: operations.id ?? "fake-repo",
    checkoutAt: operations.checkoutAt?.bind(operations) ?? unexpected("repo.checkoutAt"),
    worktrees: operations.worktrees?.bind(operations) ?? unexpected("repo.worktrees"),
    envFiles,
    caseInsensitive:
      operations.caseInsensitive?.bind(operations) ?? unexpected("repo.caseInsensitive"),
    isIgnored: operations.isIgnored?.bind(operations) ?? unexpected("repo.isIgnored"),
    ensureIgnored: operations.ensureIgnored?.bind(operations) ?? unexpected("repo.ensureIgnored"),
  };
}
