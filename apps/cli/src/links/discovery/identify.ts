import { EnvdenError } from "@envden/core/errors";
import type { IRepoAdapter } from "@envden/core/adapters";

export interface IRepoSkip {
  path: string;
  reason: string;
  kind: TRepoSkipKind;
}

export type TRepoSkipKind = "remote" | "identity";

export async function identify(
  repo: IRepoAdapter,
  path: string,
  report: (skip: IRepoSkip) => void,
) {
  try {
    const checkout = await repo.checkoutAt(path);
    if (!checkout) report({ path, reason: "Repository identity unavailable", kind: "identity" });

    return checkout;
  } catch (error) {
    report(repoSkip(path, error));

    return undefined;
  }
}

// the git adapter rejects missing, ambiguous and unsupported remotes as invalid input
function repoSkip(path: string, error: unknown): IRepoSkip {
  if (error instanceof EnvdenError && error.code === "INVALID_INPUT")
    return { path, reason: error.message, kind: "remote" };

  return {
    path,
    reason: error instanceof EnvdenError ? error.message : "Repository identity unavailable",
    kind: "identity",
  };
}
