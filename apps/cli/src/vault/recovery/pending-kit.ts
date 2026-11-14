import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { loadState } from "../../state/store/repository.ts";

export function resumedKit(
  state: NonNullable<Awaited<ReturnType<typeof loadState>>>,
  options: { address: string; resumeSecretKey?: string },
) {
  if (!options.resumeSecretKey)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Resume setup with the recovery kit issued before creation",
    );

  const vaultId = state.vaultId!;
  const secret = p.decodeSecretKey(options.resumeSecretKey);

  if (state.creationPending) {
    const swap = p.decode(
      p.SwapCodec,
      new Uint8Array(Buffer.from(state.creationPending, "base64url")),
    );

    if (!swap.skPub || !p.equal(p.skPub(secret, p.unbase32(vaultId)), swap.skPub))
      throw new EnvdenError("INVALID_INPUT", "Recovery kit does not match pending vault");
  }

  return {
    vaultId,
    secretKey: options.resumeSecretKey,
    server: options.address,
    masterPassword: "________________",
  };
}
