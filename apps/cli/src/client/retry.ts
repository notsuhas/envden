import { EnvdenError } from "@envden/core/errors";

export async function retryHead<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "HEAD_MOVED" || attempt === 2)
        throw error;
    }
  }

  throw new EnvdenError("HEAD_MOVED", "Head kept moving; retry the command");
}

export async function retryBusy<T>(run: () => Promise<T>, wait = backoff): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof EnvdenError) || error.code !== "BUSY" || attempt === 2) throw error;
      await wait(100 * (attempt + 1));
    }
  }
}

function backoff(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
