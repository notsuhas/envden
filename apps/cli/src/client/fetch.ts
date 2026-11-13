import { EnvdenError } from "@envden/core/errors";

export type TFetch = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

export async function serverFetch(fetcher: TFetch, ...args: Parameters<TFetch>) {
  try {
    return await fetcher(...args);
  } catch (cause) {
    if (cause instanceof EnvdenError) throw cause;

    throw new EnvdenError(
      "SERVER_UNREACHABLE",
      "Server unreachable; check the server address and your private network",
      { cause },
    );
  }
}
