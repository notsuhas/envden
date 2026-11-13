import { readFile } from "node:fs/promises";
import { input, secret } from "../../output/questions.ts";
import { parseKit } from "./input.ts";

export async function readKit(path?: string, promptSecret = secret, promptInput = input) {
  return path
    ? parseKit(JSON.parse(await readFile(path, "utf8")))
    : parseKit({
        secretKey: await promptSecret("Recovery secret key"),
        vaultId: await promptInput("Vault ID"),
      });
}
