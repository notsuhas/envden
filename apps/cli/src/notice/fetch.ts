import type { TFetch } from "../client/fetch.ts";

export function boundedFetch(fetcher: TFetch, deadline = AbortSignal.timeout(2000)): TFetch {
  return async (input, init) => {
    const signal = init?.signal ? AbortSignal.any([deadline, init.signal]) : deadline;
    signal.throwIfAborted();
    let abort = () => {};

    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });

    try {
      return await Promise.race([fetcher(input, { ...init, signal }), cancelled]);
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
}
