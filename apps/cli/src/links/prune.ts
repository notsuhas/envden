import { removeConflictTargets } from "../sync/local/conflicts.ts";
import { removeCheckoutBases } from "./checkout/bases.ts";
import { dirname } from "node:path";
import { lstat } from "node:fs/promises";
import type { ILocalState } from "../state/model.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { saveState } from "../state/store/repository.ts";

export async function pruneMissingCheckouts(
  home: string,
  state: ILocalState,
  notice: (message: string) => void,
) {
  return withStateLock(home, async () => {
    for (const approval of state.approved) {
      try {
        await lstat(approval.root);
      } catch (cause) {
        if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
        const parent = await lstat(dirname(approval.root)).catch(() => undefined);

        if (!parent || (approval.rootDevice !== undefined && parent.dev !== approval.rootDevice))
          continue;

        state.approved = state.approved.filter((item) => item.root !== approval.root);

        await removeCheckoutBases(
          home,
          state.links.filter((item) => item.root === approval.root),
          state.links.filter((item) => item.root !== approval.root),
        );

        await removeConflictTargets(home, approval.root);

        state.links = state.links.filter((item) => item.root !== approval.root);
        notice(`Missing checkout removed: ${approval.root}`);
      }
    }

    await saveState(home, state);
  });
}
