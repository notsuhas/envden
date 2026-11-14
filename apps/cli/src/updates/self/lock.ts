import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { EnvdenError } from "@envden/core/errors";
import { withStateLock } from "../../state/lock/lock.ts";

export async function withUpdateLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  let acquired = false;

  try {
    return await withStateLock(
      join(home, "state", "update"),
      () => {
        acquired = true;

        return action();
      },
      {
        now: () => performance.timeOrigin + performance.now(),
        wait: async () => {},
        delays: [],
      },
    );
  } catch (cause) {
    if (!acquired && cause instanceof EnvdenError && cause.code === "CONFLICT")
      throw new EnvdenError("CONFLICT", "Another envden update is running");

    throw cause;
  }
}
