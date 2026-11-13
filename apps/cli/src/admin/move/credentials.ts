import { join } from "node:path";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import { optionalRead } from "../../state/files.ts";
import { binary } from "../../client/encoding.ts";

export async function moveCredentials(
  adapters: TAdapters,
  directory: string,
  options: { token?: string | undefined },
) {
  const savedPin = await optionalRead(join(directory, "move-pin"));
  const tokenSlot = `envden/${adapters.home}/move-token`;

  if (options.token)
    await adapters.keychain.set(tokenSlot, new TextEncoder().encode(options.token));

  const savedToken = await adapters.keychain.get(tokenSlot);

  const token = savedToken
    ? p.decodeToken("setup", new TextDecoder().decode(savedToken))
    : undefined;

  const pin = token?.serverPin ?? (savedPin ? binary(savedPin) : undefined);
  if (!pin) throw new EnvdenError("INVALID_INPUT", "A setup token is required for a new move");

  return { token, pin, tokenSlot };
}
