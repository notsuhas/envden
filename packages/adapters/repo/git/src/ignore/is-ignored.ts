import { EnvdenError } from "@envden/core/errors";
import type { ICheckout } from "@envden/core/adapters";
import { git } from "../exec/git.ts";
import { tracked } from "../env-files/tracked.ts";
import { validatePath } from "../env-files/validate-path.ts";

export async function isIgnored(checkout: ICheckout, path: string): Promise<boolean> {
  validatePath(path);
  if (await tracked(checkout, path)) return false;

  try {
    await git(checkout.root, ["check-ignore", "-q", "--", path]);

    return true;
  } catch (error) {
    if (
      error instanceof EnvdenError &&
      error.cause &&
      typeof error.cause === "object" &&
      "exitCode" in error.cause &&
      error.cause.exitCode === 1
    )
      return false;

    throw error;
  }
}
