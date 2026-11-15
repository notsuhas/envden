import { z } from "zod";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

const kitSchema = z.object({
  vaultId: z.string().refine((value) => !vaultIdProblem(value)),
  secretKey: z.string().refine((value) => !secretKeyProblem(value)),
});

function decodes(decode: () => Uint8Array, length: number) {
  try {
    return decode().length === length;
  } catch {
    return false;
  }
}

export function secretKeyProblem(text: string) {
  return decodes(() => p.decodeSecretKey(text.trim()), 16)
    ? undefined
    : "Not a secret key. Copy the EK1-… line from your recovery kit";
}

export function vaultIdProblem(text: string) {
  return decodes(() => p.unbase32(text.trim()), 32)
    ? undefined
    : "Not a vault ID. Copy it from your recovery kit";
}

export function parseKit(text: string) {
  try {
    const kit = kitSchema.parse(JSON.parse(text));

    return { vaultId: kit.vaultId.trim(), secretKey: kit.secretKey.trim() };
  } catch (cause) {
    throw new EnvdenError("INVALID_INPUT", "Not a recovery kit file", { cause });
  }
}
