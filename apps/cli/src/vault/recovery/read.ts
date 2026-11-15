import { readFile } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import { input, secret } from "../../output/prompts/questions.ts";
import { parseKit, secretKeyProblem, vaultIdProblem } from "./input.ts";

export async function readKit(path?: string, promptSecret = secret, promptInput = input) {
  if (path) return parseKit(await readKitFile(path));

  const secretKey = await promptSecret("Recovery secret key", secretKeyProblem);
  const vaultId = await promptInput("Vault ID", true, undefined, vaultIdProblem);

  return { secretKey: secretKey.trim(), vaultId: vaultId.trim() };
}

async function readKitFile(path: string) {
  return readFile(path, "utf8").catch((cause: unknown) => {
    throw new EnvdenError("INVALID_INPUT", "Can't read the recovery kit file", { cause });
  });
}
