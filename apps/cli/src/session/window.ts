import { UnlockWindowSchema } from "@envden/core/protocol";
import { isEnvdenError } from "@envden/core/errors";
import type { TClient } from "../client/request.ts";
import type { ILocalState } from "../state/model.ts";

// A locked device (kit reset) or a restored server has no window to report, so the old record stays.
export async function recordUnlockWindow(client: TClient, state: ILocalState) {
  try {
    state.session = UnlockWindowSchema.parse(
      await (await client.request("/v1/unlock-window")).json(),
    );
  } catch (error) {
    if (!isEnvdenError(error) || !["LOCKED", "RESTORED_MODE"].includes(error.code)) throw error;
  }
}
