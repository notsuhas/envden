import { owner } from "../../state/lock/owner.ts";
import { processIdentity } from "../../state/lock/process.ts";
import { reclaimLock } from "../../state/lock/reclaim.ts";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { EnvdenError } from "@envden/core/errors";
import { withStateLock } from "../../state/lock/lock.ts";

export async function withUpdateLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  let acquired = false;
  const path = join(home, "state", "update", "state", "write.lock");
  const previous = await owner(path);
  const identity = await processIdentity();

  if (previous?.identity && identity && previous.identity !== identity)
    await reclaimLock(path, previous.token, performance.timeOrigin + performance.now());

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
