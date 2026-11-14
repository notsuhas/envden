import { EnvdenError } from "../../errors/index.ts";
import type { IChainSource } from "./source.ts";

export class SourceFailure extends EnvdenError {
  constructor(cause: unknown) {
    super("INTERNAL", "Chain source failed", { cause });
  }
}

export function protectSource(source: IChainSource): IChainSource {
  return {
    header: (hash) => fetchValue(() => source.header(hash)),
    entry: (hash) => fetchValue(() => source.entry(hash)),
    files: (hash) => fetchValue(() => source.files(hash)),
    keyring: (hash) => fetchValue(() => source.keyring(hash)),
    epochKey: (epoch) => fetchValue(() => source.epochKey(epoch)),
  };
}

async function fetchValue<T>(fetch: () => T | Promise<T>): Promise<T> {
  try {
    return await fetch();
  } catch (cause) {
    throw new SourceFailure(cause);
  }
}
