import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { loadState } from "../../state/store/repository.ts";
import { replaceKit } from "../../admin/recovery/credentials.ts";

export const BLANK_PASSWORD = "________________";

const LOST_KIT = "Vault created without a recovery kit; run envden vault kit replace";

export interface ISetupKit {
  secretKey: string;
  vaultId: string;
  server: string;
  masterPassword: string;
}

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
    masterPassword: BLANK_PASSWORD,
  };
}

// The kit printed before creation is lost, so the committed vault gets a new one straight away.
export async function lostKitReplacement(
  adapters: TAdapters,
  options: {
    password: string;
    now: () => number;
    fetcher: TFetch;
    onKit?: (kit: ISetupKit) => Promise<void>;
  },
) {
  const result = await replaceKit(
    adapters,
    options.password,
    options.now,
    async (kit) => options.onKit?.({ ...kit, masterPassword: BLANK_PASSWORD }),
    options.fetcher,
  ).catch((cause: unknown) => {
    throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT, { cause });
  });

  if (result.kind !== "replaced") throw new EnvdenError("RECOVERY_KIT_REQUIRED", LOST_KIT);

  return {
    state: (await loadState(adapters.home))!,
    kit: { ...result.kit, masterPassword: BLANK_PASSWORD },
  };
}
