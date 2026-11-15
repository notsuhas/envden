import type { TAdapters } from "../adapters.ts";
import { remoteNotice } from "../notice/remote.ts";

export async function remoteFiles(adapters: TAdapters) {
  try {
    return (
      await remoteNotice(adapters, { now: adapters.now, fetcher: adapters.fetcher, all: true })
    ).files;
  } catch {
    return undefined;
  }
}
